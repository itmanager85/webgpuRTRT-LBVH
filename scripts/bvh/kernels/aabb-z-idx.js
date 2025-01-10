class AABB_Z_IDX {

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
                        type: "storage"
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
                        type: "storage"
                    }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "uniform"
                    }
                }
            ]
        })

        this.SM = device.createShaderModule({
            code: this.SRC(),
            label: "AABB/Z-index shader module"
        })

        this.PIPELINE = this.device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.BG_LAYOUT]
            }),
            compute: {
                module: this.SM,
                entryPoint: "compute_aabb_z_idx"
            }
        })

        return true;
    }

    TRIANGLE_BUFFER = null;

    // текущее количество треугольников в сцене 
    size = 0

    // зарезервированное место под буферы (BVH_BUFFER), максимальное количество треугольников (под которые уже выделена память)
    reserved_size = 0;

    hard_reset_size(TRIANGLE_BUFFER, size) { //, bounds

        if (size < 0 || size > this.MAX_TRIANGLES_COUNT) { // 1M (max)
            return false;
        }

        // а если 0 треугольников или (null == TRIANGLE_BUFFER) ?
        this.TRIANGLE_BUFFER = TRIANGLE_BUFFER;

        // create all the necessary buffers
        this.AABB_BUFFER = this.device.createBuffer({
            size: size * 32,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        })
        this.Z_IDX_BUFFER = this.device.createBuffer({
            size: size *  4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        })
        this.UNIFORM_BUFFER = this.device.createBuffer({
            size: 32,
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
                        buffer: this.Z_IDX_BUFFER
                    }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    resource: {
                        buffer: this.UNIFORM_BUFFER
                    }
                }
            ]
        })

        this.size = size;
        this.reserved_size = size;
    }

    update_bounds(bounds) {

        const BUFF = new ArrayBuffer(32)
        const   DV = new DataView(BUFF)

        DV.setFloat32( 0, bounds.min[0], true)
        DV.setFloat32( 4, bounds.min[1], true)
        DV.setFloat32( 8, bounds.min[2], true)
        
        DV.setFloat32(16, bounds.max[0], true)
        DV.setFloat32(20, bounds.max[1], true)
        DV.setFloat32(24, bounds.max[2], true)

        DV.setInt32(12, this.size, true)

        this.device.queue.writeBuffer(
            this.UNIFORM_BUFFER,
            0,
            BUFF,
            0,
            32
        )
    }

    update(TRIANGLE_BUFFER, size, bounds) {

        if (TRIANGLE_BUFFER.size != 48 * size) {
            console.warn(`in AABB/Z-index: buffer size [ ${TRIANGLE_BUFFER.size} ] does not match requested size [ ${size} ]`)
            return
        }

        this.hard_reset_size( TRIANGLE_BUFFER, size );
        this.update_bounds( bounds );
    }

    prepare_buffers( I_TRIANGE_BUFFER, NUM_TRIS, MODEL_BOUNDS ) {
        this.update( I_TRIANGE_BUFFER, NUM_TRIS, MODEL_BOUNDS );
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


        return { AABB_BUFFER : this.AABB_BUFFER, Z_IDX_BUFFER : this.Z_IDX_BUFFER }
    }

    SRC() {
        return /* wgsl */ `

        struct Triangle {
            v0 : vec3f,
            v1 : vec3f,
            v2 : vec3f
        };

        struct AABB {
            min : vec3f,
            max : vec3f
        };

        struct Uniforms {
            min : vec3f,
            num : i32,
            max : vec3f,
            f_1 : i32
        };

        @group(0) @binding(0) var<storage, read_write> triangles : array<Triangle>;
        @group(0) @binding(1) var<storage, read_write> aabbs     : array<AABB>;
        @group(0) @binding(2) var<storage, read_write> z_indexes : array<u32>;
        @group(0) @binding(3) var<uniform> uniforms : Uniforms;

        @compute @workgroup_size(${this.WG_SIZE})
        fn compute_aabb_z_idx(@builtin(global_invocation_id) global_id : vec3u) {
            var idx : i32 = i32(global_id.x);
            if (idx >= uniforms.num) {
                return;
            }

            var tri : Triangle = triangles[idx];
            
            var box : AABB;
            box.min = min(tri.v0, min(tri.v1, tri.v2));
            box.max = max(tri.v0, max(tri.v1, tri.v2));

            aabbs[idx] = box;

            var cen : vec3f = (box.max + box.min) * .5f;
            var rel : vec3f = (cen - uniforms.min) / (uniforms.max - uniforms.min);
            
            z_indexes[idx] = morton_code(vec3u(rel * 1023.99f));
        }

        fn morton_code(upos : vec3u) -> u32 {
            return split_3(upos.x) | (split_3(upos.y) << 1) | (split_3(upos.z) << 2);
        }
        
        // from: https://stackoverflow.com/questions/1024754/how-to-compute-a-3d-morton-number-interleave-the-bits-of-3-ints
        fn split_3(u : u32) -> u32 {
            var x : u32 = u;
            x = (x | (x << 16)) & 0x030000FFu;
            x = (x | (x <<  8)) & 0x0300F00Fu;
            x = (x | (x <<  4)) & 0x030C30C3u;
            x = (x | (x <<  2)) & 0x09249249u;
            return x;
        }`
    }
}
