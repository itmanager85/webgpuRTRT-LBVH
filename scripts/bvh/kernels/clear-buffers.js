class ClearBuffer {

    // shader parameters
    WG_SIZE = 64

    device = null;

    BG_LAYOUT;
    PIPELINE;

    constructor( device ){

        if ( null == device ) {
            return false;
        }

        this.device = device;

        // create bind group layout, shader module and pipeline
        this.BG_LAYOUT = device.createBindGroupLayout({
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
                        type: "uniform"
                    }
                }
            ]
        })

        const SM = device.createShaderModule({
            code: this.SRC(),
            label: "init buffer shader module"
        })

        this.PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.BG_LAYOUT]
            }),
            compute: {
                module: SM,
                entryPoint: "init_buffer"
            }
        })
    }

    BUFFER = null;
    UNIFORM_BUFFER;

    prepare_buffers( BUFFER, size ){

        if (BUFFER.size != 4 * size) {
            console.warn(`in clearbuffer: buffer size [ ${BUFFER.size} ] does not match requested size [ ${size} ]`)
            return
        }

        this.BUFFER = BUFFER;
        this.size = size;

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
                        buffer: BUFFER
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    resource: {
                        buffer: this.UNIFORM_BUFFER
                    }
                }
            ]
        })
    }

    async clear( value = 0) {
        await this.init(value);
    }

    // initialize the index array
    async init( value ) {

        this.device.queue.writeBuffer(
            this.UNIFORM_BUFFER,
            0,
            new Uint32Array([
                this.size,
                value,
                0,
                0
            ])
        )

        const CE = this.device.createCommandEncoder()
        const  P = CE.beginComputePass()

        P.setPipeline(this.PIPELINE)
        P.setBindGroup(0, this.BG)
        P.dispatchWorkgroups(Math.ceil(this.size / this.WG_SIZE)) // / 4
        P.end()

        this.device.queue.submit([CE.finish()])
    }

    SRC() {
        return /* wgsl */ `

            struct Uniforms {
                num : i32,
                value : i32,
                f_2 : i32,
                f_3 : i32
            };

            @group(0) @binding(0) var<storage, read_write> buffer : array<i32>;
            @group(0) @binding(1) var<uniform> uniforms : Uniforms;

            // set bvh in the buffer to 0, 0, 0, ...
            @compute @workgroup_size(${this.WG_SIZE})
            fn init_buffer(@builtin(global_invocation_id) global_id : vec3u) {
                let idx : i32 = i32(global_id.x);
                if (idx < uniforms.num) {
                    buffer[idx] = uniforms.value;
                }

                //for (var i : i32 = 0; i < 4; i++) {
                //    let idx : i32 = 4 * i32(global_id.x) + i;
                //    if (idx < uniforms.num) {
                //        buffer[idx] = 0;
                //    }
                //}
            }
        `;
    }
}

