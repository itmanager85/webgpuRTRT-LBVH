class AABB_UPDATE {

    // shader parameters
    WG_SIZE = 64

    // предельное количество треугольников в сцене 
    MAX_TRIANGLES_COUNT = 2_100_000;

    device = null;

    SM = null
    BG_LAYOUT = null;
    PIPELINE = null

    constructor( device ) {
        this.init( device )
    }

    init( device ) {

        if ( null == device ) {
            return false;
        }

        this.device = device;

        // create bind group layout, shader module and pipeline
        this.BG_LAYOUT = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "read-only-storage"
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "storage"
                    }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "uniform"
                    }
                }
            ]
        })

        this.SM = device.createShaderModule({
            code: this.SRC(),
            label: "AABB/Update shader module"
        })

        this.PIPELINE = this.device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.BG_LAYOUT]
            }),
            compute: {
                module: this.SM,
                entryPoint: "compute_aabb_bounds"
            }
        })

        return true;
    }

    TRIANGLE_BUFFER = null;

    // текущее количество треугольников в сцене 
    size = 0

    hard_reset_size(TRIANGLE_BUFFER, size) { //, bounds

        if (size < 0 || size > this.MAX_TRIANGLES_COUNT) { // 2.1M (max)
            return false;
        }

        // а если 0 треугольников или (null == TRIANGLE_BUFFER) ?
        this.TRIANGLE_BUFFER = TRIANGLE_BUFFER;

        // create all the necessary buffers
        this.AABB_BUFFER = this.device.createBuffer({
            size: size * 32,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        })
        this.UNIFORM_BUFFER = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        // create the bind group
        this.BG = this.device.createBindGroup({
            layout: this.BG_LAYOUT,
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    resource: {
                        buffer: this.TRIANGLE_BUFFER
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    resource: {
                        buffer: this.AABB_BUFFER
                    }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    resource: {
                        buffer: this.UNIFORM_BUFFER
                    }
                }
            ]
        })

        this.size = size;
        //this.reserved_size = size;
    }

    update_num_tris_uniform() {

        const BUFF = new ArrayBuffer(16)
        const   DV = new DataView(BUFF)

        DV.setInt32(0, this.size, true)

        this.device.queue.writeBuffer(
            this.UNIFORM_BUFFER,
            0,
            BUFF,
            0,
            16
        )
    }

    update(TRIANGLE_BUFFER, size) {

        if (TRIANGLE_BUFFER.size != 48 * size) {
            console.warn(`in AABB/Update: buffer size [ ${TRIANGLE_BUFFER.size} ] does not match requested size [ ${size} ]`)
            return
        }

        this.hard_reset_size( TRIANGLE_BUFFER, size );
        this.update_num_tris_uniform();
    }

    prepare_buffers( I_TRIANGE_BUFFER, NUM_TRIS ) {
        this.update( I_TRIANGE_BUFFER, NUM_TRIS );
    }

    async execute() {

        {// send work to GPU

                const CE = this.device.createCommandEncoder()
                const  P = CE.beginComputePass()

                P.setPipeline(this.PIPELINE)
                P.setBindGroup(0, this.BG)

                P.dispatchWorkgroups(Math.ceil(this.size / this.WG_SIZE)) // size ?
                P.end()

                this.device.queue.submit([CE.finish()])

        }

        return { AABB_BUFFER : this.AABB_BUFFER }
    }

    SRC() {
        return ` // wgsl       

        struct Triangle {
            v0 : vec3f,
            v1 : vec3f,
            v2 : vec3f
        };

        struct AABB {
            min : vec3f,
            max : vec3f
        }

        struct Uniforms {
            num : i32
        };
            
        @group(0) @binding(0) var<storage, read> triangles   : array<Triangle>;
        @group(0) @binding(1) var<storage, read_write> aabbs : array<AABB>;
        @group(0) @binding(2) var<uniform> uniforms : Uniforms;

        @compute @workgroup_size(${this.WG_SIZE})
        fn compute_aabb_bounds(@builtin(global_invocation_id) global_id : vec3u) {
            var idx : i32 = i32(global_id.x);
            if (idx >= uniforms.num) {
                return;
            }

            var tri : Triangle = triangles[idx];
            
            var box : AABB;
            box.min = min(tri.v0, min(tri.v1, tri.v2));
            box.max = max(tri.v0, max(tri.v1, tri.v2));

            aabbs[idx] = box;
        }
        `
    }
}