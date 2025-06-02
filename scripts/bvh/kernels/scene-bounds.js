class SCENE_BOUNDS {

    // shader parameters
    //WG_SIZE = 64
    workgroupSize = 256;

    // предельное количество треугольников в сцене 
    MAX_TRIANGLES_COUNT = 2_100_000;

    device = null;

    SM = null
    REDUCE_SM = null
    BG_LAYOUT = null;
    PIPELINE1 = null
    REDUCE_PIPELINE = null

    constructor( device ) {
        this.init( device )
    }

    init( device ) {

        if ( null == device ) {
            return false;
        }

        this.device = device;

        this.SM = device.createShaderModule({
            code: this.firstPassCode(),
            label: "SCENE/Bounds firstPassCode shader module"
        })

        this.REDUCE_SM = device.createShaderModule({
            code: this.reduceCode(),
            label: "SCENE/Bounds reduceCode shader module"
        })

        this.BG_LAYOUT = device.createBindGroupLayout({
            entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            ],
        });

        this.PIPELINE1 = this.device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.BG_LAYOUT]
            }),
            compute: {
                module: this.SM,
                entryPoint: "main"
            }
        })

        this.REDUCE_PIPELINE = this.device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.BG_LAYOUT]
            }),
            compute: {
                module: this.REDUCE_SM,
                entryPoint: "main"
            }
        })
    }

    // текущее количество треугольников в сцене 
    size = 0

    UNIFORM_BUFFER; //RESULT_BOUNDS;

    last_input;
    levels_bindGroups = [];
    hard_reset_size(AABB_BUFFER, size) { //, bounds

        if (size < 0 || size > this.MAX_TRIANGLES_COUNT) { // 2.1M (max)
            return false;
        }

        this.AABB_BUFFER = AABB_BUFFER;

        //this.RESULT_BOUNDS 
        this.UNIFORM_BUFFER = this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

          // === Step 3: Buffers for intermediate results ===
        const levels = [];
        let count = size; // totalAABBs;
        while (count > 1) {
            const groups = Math.ceil(count / this.workgroupSize);
            const buf = this.device.createBuffer({
                size: groups * 2 * 16,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            levels.push({ groups, buffer: buf });
            count = groups;
        }

        //const levels_bindGroups = [];
        let input = this.AABB_BUFFER;
        this.last_input = input;
        let layout = this.BG_LAYOUT;
        for (let i = 0; i < levels.length; i++) {

            const output = levels[i].buffer;
            const pipeline = (i === 0) ? this.PIPELINE1 : this.REDUCE_PIPELINE;
            const bindGroup = this.device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: { buffer: input } },
                { binding: 1, resource: { buffer: output } },
            ],
            });

            this.levels_bindGroups.push({pipeline : pipeline, bindGroup : bindGroup, groups : levels[i].groups});

            this.last_input = input = output;
        }

        this.size = size;
        //this.reserved_size = size;
    }

    update_num_tris_uniform() {

        const BUFF = new ArrayBuffer(64)
        const   DV = new DataView(BUFF)

        DV.setInt32(32, this.size, true) //DV.setInt32(12, this.size, true)

        this.device.queue.writeBuffer(
            this.UNIFORM_BUFFER,
            0,
            BUFF,
            0,
            64
        )
    }

    update(AABB_BUFFER, size, bounds) {

        if (AABB_BUFFER.size != 32 * size) {
            console.warn(`in SCENE/Bounds: buffer size [ ${AABB_BUFFER.size} ] does not match requested size [ ${size} ]`)
            return
        }

        this.hard_reset_size( AABB_BUFFER, size );
        this.update_num_tris_uniform();
    }

    prepare_buffers( AABB_BUFFER, NUM_TRIS ) {
        this.update( AABB_BUFFER, NUM_TRIS );
    }

    async execute() {

        {// send work to GPU
            const CE = this.device.createCommandEncoder()
            const  P = CE.beginComputePass()

            for (let i = 0; i < this.levels_bindGroups.length; i++) {

                P.setPipeline(this.levels_bindGroups[i].pipeline)
                P.setBindGroup(0, this.levels_bindGroups[i].bindGroup)

                P.dispatchWorkgroups(this.levels_bindGroups[i].groups)
            }

            P.end()
            CE.copyBufferToBuffer(this.last_input, 0, this.UNIFORM_BUFFER, 0, 32); // RESULT_BOUNDS

            this.device.queue.submit([CE.finish()])
        }


        return { AABB_BUFFER : this.AABB_BUFFER, Z_IDX_BUFFER : this.Z_IDX_BUFFER }
    }

    // === Step 2: Create reduction shader for AABB -> partialBounds ===
    firstPassCode() {

        return ` // wgsl

        struct AABB {
            min: vec3f,
            max: vec3f,
        };

        @group(0) @binding(0) var<storage, read> aabbBuffer: array<AABB>;
        @group(0) @binding(1) var<storage, read_write> outputBounds: array<vec4f>;

        var<workgroup> wgMin: array<vec3<f32>, ${this.workgroupSize}>;
        var<workgroup> wgMax: array<vec3<f32>, ${this.workgroupSize}>;

        @compute @workgroup_size(${this.workgroupSize})
        fn main(@builtin(global_invocation_id) gid: vec3u,
                @builtin(local_invocation_id) lid: vec3u,
                @builtin(workgroup_id) wid: vec3u) {
            let index = gid.x;
            var minVal = vec3f(999999.0);
            var maxVal = vec3f(-999999.0);

            if (index < arrayLength(&aabbBuffer)) {
                let aabb = aabbBuffer[index];
                minVal = aabb.min;
                maxVal = aabb.max;
            }

            wgMin[lid.x] = minVal;
            wgMax[lid.x] = maxVal;
            workgroupBarrier();

            var offset = ${this.workgroupSize >> 1}u; // this.workgroupSize / 2
            loop {
                if (lid.x < offset) {
                wgMin[lid.x] = min(wgMin[lid.x], wgMin[lid.x + offset]);
                wgMax[lid.x] = max(wgMax[lid.x], wgMax[lid.x + offset]);
                }
                workgroupBarrier();
                if (offset == 1u) { break; }
                offset >>= 1; //offset / 2u;
            }

            if (lid.x == 0u) {
                let i = wid.x;
                outputBounds[i * 2u + 0u] = vec4f(wgMin[0], 0.0);
                outputBounds[i * 2u + 1u] = vec4f(wgMax[0], 0.0);
            }
        }
        `
    }

    reduceCode() {

        return ` // wgsl

        @group(0) @binding(0) var<storage, read> inputBounds: array<vec4f>;
        @group(0) @binding(1) var<storage, read_write> outputBounds: array<vec4f>;

        var<workgroup> wgMin: array<vec3<f32>, ${this.workgroupSize}>;
        var<workgroup> wgMax: array<vec3<f32>, ${this.workgroupSize}>;

        @compute @workgroup_size(${this.workgroupSize})
        fn main(@builtin(global_invocation_id) gid: vec3u,
                @builtin(local_invocation_id) lid: vec3u,
                @builtin(workgroup_id) wid: vec3u) {
            let idx = gid.x;
            var minVal = vec3f(999999.0);
            var maxVal = vec3f(-999999.0);

            if (idx * 2u + 1u < arrayLength(&inputBounds)) {
                minVal = inputBounds[idx * 2u + 0u].xyz;
                maxVal = inputBounds[idx * 2u + 1u].xyz;
            }

            wgMin[lid.x] = minVal;
            wgMax[lid.x] = maxVal;
            workgroupBarrier();

            var offset = ${this.workgroupSize >> 1}u; // this.workgroupSize / 2
            loop {
                if (lid.x < offset) {
                wgMin[lid.x] = min(wgMin[lid.x], wgMin[lid.x + offset]);
                wgMax[lid.x] = max(wgMax[lid.x], wgMax[lid.x + offset]);
                }
                workgroupBarrier();
                if (offset == 1u) { break; }
                offset >>= 1; //offset / 2u;
            }

            if (lid.x == 0u) {
                let i = wid.x;
                outputBounds[i * 2u + 0u] = vec4f(wgMin[0], 0.0);
                outputBounds[i * 2u + 1u] = vec4f(wgMax[0], 0.0);
            }
        }
        `
    } 
}