
class RadixSort {

    device = null;

    SCAN_UP_BG_LAYOUTS;
    INPUT_L_BG_LAYOUTS;

    INIT_IDX_PIPELINE;
    INIT_OFF_PIPELINE;
    L_SCAN_PIPELINE;
    SCAN_UP_PIPELINE;

    constructor( device ) {
        if ( null == device ) {
            return false;
        }

        this.device = device;  

        // create bind group layouts
        this.SCAN_UP_BG_LAYOUTS = [
            device.createBindGroupLayout({
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
                    }
                ]
            }),
            device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: {
                            type: "uniform"
                        }
                    }
                ]
            })
        ]

        this.INPUT_L_BG_LAYOUTS = [
            device.createBindGroupLayout({
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
                            type: "storage"
                        }
                    }
                ]
            }),
            device.createBindGroupLayout({
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
                    }
                ]
            }),
            device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: {
                            type: "uniform"
                        }
                    }
                ]
            })
        ]

        // compile shaders
        const SCAN_UP_SM = device.createShaderModule({
            code: this.SCAN_UP_SRC(),
            label: "scan up shader module"
        })

        const INPUT_L_SM = device.createShaderModule({
            code: this.INPUT_L_SRC(),
            label: "input level shader module"
        })

        // create pipelines
        this.INIT_IDX_PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: this.INPUT_L_BG_LAYOUTS
            }),
            compute: {
                module: INPUT_L_SM,
                entryPoint: "init_idx"
            }
        })

        this.INIT_OFF_PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: this.INPUT_L_BG_LAYOUTS
            }),
            compute: {
                module: INPUT_L_SM,
                entryPoint: "init_off"
            }
        })

        this.L_SCAN_PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: this.INPUT_L_BG_LAYOUTS
            }),
            compute: {
                module: INPUT_L_SM,
                entryPoint: "scan_and_sort"
            }
        })

        this.SCAN_UP_PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: this.SCAN_UP_BG_LAYOUTS
            }),
            compute: {
                module: SCAN_UP_SM,
                entryPoint: "scan_up"
            }
        })
    } 

    uniformBuffer;
    valBuffers;
    idxBuffers;
    l1OffsetsBuffer;
    l2OffsetsBuffer;
    l3OffsetsBuffer;

    SCAN_UP_BGS;
    INPUT_L_BGS;

    size = 0;

    IDX_BUFFER = null;

    prepare_buffers (valBuffer, size) {

        if (valBuffer.size != size * 4) {
            console.warning(`in radix sort: buffer size [ ${valBuffer.size} ] does not match requested size [ ${size} ]`)
            return
        }

        this.size = size;

        // create all necessary buffers

        this.valBuffers = [
            valBuffer,
            this.device.createBuffer({
                size: valBuffer.size,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            })
        ]

        this.idxBuffers = [
            this.device.createBuffer({
                size: valBuffer.size,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            }),
            this.device.createBuffer({
                size: valBuffer.size,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            })
        ]

        this.IDX_BUFFER = this.idxBuffers[0];

        this.l1OffsetsBuffer = this.device.createBuffer({
            size: 256 * 256 * 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        })
    
        this.l2OffsetsBuffer = this.device.createBuffer({
            size: 256 * 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        })
    
        this.l3OffsetsBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        })
    
        this.uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        // create necessary bind groups

        this.SCAN_UP_BGS = [
            this.device.createBindGroup({
                layout: this.SCAN_UP_BG_LAYOUTS[0],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.l1OffsetsBuffer
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.l2OffsetsBuffer
                        }
                    }
                ]
            }),
            this.device.createBindGroup({
                layout: this.SCAN_UP_BG_LAYOUTS[0],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.l2OffsetsBuffer
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.l3OffsetsBuffer
                        }
                    }
                ]
            }),
            this.device.createBindGroup({
                layout: this.SCAN_UP_BG_LAYOUTS[1],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.uniformBuffer
                        }
                    }
                ]
            })
        ]

        this.INPUT_L_BGS = [
            this.device.createBindGroup({
                layout: this.INPUT_L_BG_LAYOUTS[0],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.idxBuffers[0]
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.valBuffers[0]
                        }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.idxBuffers[1]
                        }
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.valBuffers[1]
                        }
                    },
                ]
            }),
            this.device.createBindGroup({
                layout: this.INPUT_L_BG_LAYOUTS[0],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.idxBuffers[1]
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.valBuffers[1]
                        }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.idxBuffers[0]
                        }
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.valBuffers[0]
                        }
                    },
                ]
            }),
            this.device.createBindGroup({
                layout: this.INPUT_L_BG_LAYOUTS[1],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.l1OffsetsBuffer
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.l2OffsetsBuffer
                        }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.l3OffsetsBuffer
                        }
                    }
                ]
            }),
        ]
    }

    async execute () {

        await this.clearIDX();

        // run the 2-bit radix sort 16 times
        for (let k = 0; k < 16; k++) {
            await this.sortKthBits(k);
        }

        return { IDX_BUFFER : this.idxBuffers[0] }
    }

    // initialize the index array
    async clearIDX() {
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            0,
            new Uint32Array([
                this.size,
                0,
                0,
                0
            ])
        )

        const CE = this.device.createCommandEncoder()
        const  P = CE.beginComputePass()

        P.setPipeline(this.INIT_IDX_PIPELINE)
        P.setBindGroup(0, this.INPUT_L_BGS[0])
        P.setBindGroup(1, this.INPUT_L_BGS[2])
        P.setBindGroup(2, this.SCAN_UP_BGS[2])
        P.dispatchWorkgroups(Math.ceil(this.size / 256))
        P.end()

        this.device.queue.submit([CE.finish()])
    }

    // sort the given array based on the 2k, 2k + 1-th bits
    async sortKthBits(k) {
        {// first pass - update the offsets from the first layer
            const CE = this.device.createCommandEncoder()

            this.device.queue.writeBuffer(
                this.uniformBuffer,
                0,
                new Uint32Array([
                    this.size,
                    k,
                    0,
                    0
                ])
            )

            const  P = CE.beginComputePass()
            P.setPipeline(this.INIT_OFF_PIPELINE)
            P.setBindGroup(0, this.INPUT_L_BGS[k % 2])
            P.setBindGroup(1, this.INPUT_L_BGS[2])
            P.setBindGroup(2, this.SCAN_UP_BGS[2])
            P.dispatchWorkgroups(Math.ceil(this.size / 256))
            P.end()

            this.device.queue.submit([CE.finish()])
        }
        {// second pass - scan the level 1 offsets
            const CE = this.device.createCommandEncoder()

            this.device.queue.writeBuffer(
                this.uniformBuffer,
                0,
                new Uint32Array([
                    Math.ceil(this.size / 256),
                    k,
                    1,
                    0
                ])
            )

            const  P = CE.beginComputePass()
            P.setPipeline(this.SCAN_UP_PIPELINE)
            P.setBindGroup(0, this.SCAN_UP_BGS[0])
            P.setBindGroup(1, this.SCAN_UP_BGS[2])
            P.dispatchWorkgroups(Math.ceil(this.size / (256 * 256)))
            P.end()

            this.device.queue.submit([CE.finish()])
        }
        {// third pass - scan the level 2 offsets
            const CE = this.device.createCommandEncoder()

            this.device.queue.writeBuffer(
                this.uniformBuffer,
                0,
                new Uint32Array([
                    Math.ceil(this.size / (256 * 256)),
                    k,
                    2,
                    0
                ])
            )

            const  P = CE.beginComputePass()
            P.setPipeline(this.SCAN_UP_PIPELINE)
            P.setBindGroup(0, this.SCAN_UP_BGS[1])
            P.setBindGroup(1, this.SCAN_UP_BGS[2])
            P.dispatchWorkgroups(1)
            P.end()

            this.device.queue.submit([CE.finish()])
        }
        {// final pass - scan and write at the first level
            const CE = this.device.createCommandEncoder()

            this.device.queue.writeBuffer(
                this.uniformBuffer,
                0,
                new Uint32Array([
                    this.size,
                    k,
                    0,
                    0
                ])
            )

            const P = CE.beginComputePass()
            P.setPipeline(this.L_SCAN_PIPELINE)
            P.setBindGroup(0, this.INPUT_L_BGS[k % 2])
            P.setBindGroup(1, this.INPUT_L_BGS[2])
            P.setBindGroup(2, this.SCAN_UP_BGS[2])
            P.dispatchWorkgroups(Math.ceil(this.size / 256))
            P.end()

            this.device.queue.submit([CE.finish()])
        }
    }

    dispose(){
        // надо ли ? 
        // destroy remaining, unused buffers
        //this.uniformBuffer.destroy()
        //this.valBuffers[1].destroy()
        //this.idxBuffers[1].destroy()
        //this.l1OffsetsBuffer.destroy()
        //this.l2OffsetsBuffer.destroy()
        //this.l3OffsetsBuffer.destroy()
    }
    
    INPUT_L_SRC() {
        return /* wgsl */ `
        // bindgroup specific to interactions with the actual input
        @group(0) @binding(0) var<storage, read_write> idxs : array<i32>;
        @group(0) @binding(1) var<storage, read_write> vals : array<u32>;
        @group(0) @binding(2) var<storage, read_write> n_idxs : array<i32>;
        @group(0) @binding(3) var<storage, read_write> n_vals : array<u32>;

        // bindgroup with counts from intermediate steps
        @group(1) @binding(0) var<storage, read_write> l1_offsets : array<vec4u>;
        @group(1) @binding(1) var<storage, read_write> l2_offsets : array<vec4u>;
        @group(1) @binding(2) var<storage, read_write> l3_offsets : array<vec4u>;

        struct Uniforms {
            num : u32,
            win : u32,
            lvl : u32,
            xtr : u32
        };

        // bindgroup which stores the uniforms
        @group(2) @binding(0) var<uniform> uniforms : Uniforms;

        // set idx in the buffer to just count 0, 1, 2, ...
        @compute @workgroup_size(64)
        fn init_idx(@builtin(global_invocation_id) global_id : vec3u) {
            for (var i : u32 = 0u; i < 4; i++) {
                var idx : u32 = 4u * global_id.x + i;
                if (idx < uniforms.num) {
                    idxs[idx] = i32(idx);
                }
            }
        }

        var<workgroup> wg_count : array<atomic<u32>, 4>;

        // get the number of each element within each group
        @compute @workgroup_size(64)
        fn init_off(
            @builtin(global_invocation_id) global_id : vec3u,
            @builtin(local_invocation_id) local_id : vec3u
        ) {
            // loop over all of this thread's entries and tally how many are of each type
            var l_count : array<u32, 4>;
            for (var i : u32 = 0u; i < 4; i++) {
                var idx : u32 = 4u * global_id.x + i;
                if (idx < uniforms.num) {
                    var value : u32 = vals[idx];
                    l_count[(value >> (2u * uniforms.win)) & 3u]++;
                }
            }

            // send this to workgroup memory
            atomicAdd(&wg_count[0], l_count[0]);
            atomicAdd(&wg_count[1], l_count[1]);
            atomicAdd(&wg_count[2], l_count[2]);
            atomicAdd(&wg_count[3], l_count[3]);

            // the last thread writes the resulting vector to global memory
            workgroupBarrier();
            if (local_id.x == 63u) {
                l1_offsets[global_id.x / 64u] = vec4u(
                    atomicLoad(&wg_count[0]),
                    atomicLoad(&wg_count[1]),
                    atomicLoad(&wg_count[2]),
                    atomicLoad(&wg_count[3])
                );
            }
        }

        var<workgroup> scan_arr : array<vec4u, 64>;

        // scan across the workgroup locally, then reorder everything globally
        @compute @workgroup_size(64)
        fn scan_and_sort(
            @builtin(global_invocation_id) global_id : vec3u,
            @builtin(local_invocation_id) local_id : vec3u
        ) {
            var l_idx : u32 = local_id.x;
            var g_idx : u32 = global_id.x;

            // each thread reads four values from memory and performs a local scan
            var thread_vals : array<u32, 4>;



            for (var i : u32 = 0u; i < 4; i++) {
                var c_idx : u32 = 4u * g_idx + i;
                if (c_idx < uniforms.num) {
                    thread_vals[i] = vals[c_idx];
                }
            }
            
            // compute the offsets across the workgroup
            scan_arr[l_idx] = get_val_vec(thread_vals[0]) 
                            + get_val_vec(thread_vals[1])
                            + get_val_vec(thread_vals[2])
                            + get_val_vec(thread_vals[3]);
            workgroupBarrier();

            workgroup_scan(l_idx);

            // compute the offsets for each element & write to memory
            var thread_offs : array<vec4u, 4>;
            thread_offs[0] = scan_arr[l_idx];
            thread_offs[1] = thread_offs[0] + get_val_vec(thread_vals[0]);
            thread_offs[2] = thread_offs[1] + get_val_vec(thread_vals[1]);
            thread_offs[3] = thread_offs[2] + get_val_vec(thread_vals[2]);

            var global_offsets : vec4u;
            global_offsets[0u] = dot(vec4u(0u, 0u, 0u, 0u), l3_offsets[0u]);
            global_offsets[1u] = dot(vec4u(1u, 0u, 0u, 0u), l3_offsets[0u]);
            global_offsets[2u] = dot(vec4u(1u, 1u, 0u, 0u), l3_offsets[0u]);
            global_offsets[3u] = dot(vec4u(1u, 1u, 1u, 0u), l3_offsets[0u]);

            global_offsets += l1_offsets[g_idx / 64u];
            global_offsets += l2_offsets[g_idx / (64u * 256u)];

            for (var i : u32 = 0u; i < 4; i++) {
                var c_idx : u32 = 4u * g_idx + i;
                if (c_idx < uniforms.num) {
                    var n_idx : u32 = (global_offsets + thread_offs[i])[get_val_u32(thread_vals[i])];

                    n_idxs[n_idx] = idxs[c_idx];
                    n_vals[n_idx] = thread_vals[i];
                }
            }
        }

        // returns which radix index this input is
        fn get_val_u32(input : u32) -> u32 {
            return (input >> (2u * uniforms.win)) & 3u;
        }
        // likewise, but for vector
        fn get_val_vec(input : u32) -> vec4u {
            var shifted = get_val_u32(input);

            if (shifted == 0u) {
                return vec4u(1u, 0u, 0u, 0u);
            }
            if (shifted == 1u) {
                return vec4u(0u, 1u, 0u, 0u);
            }
            if (shifted == 2u) {
                return vec4u(0u, 0u, 1u, 0u);
            }
            
            return vec4u(0u, 0u, 0u, 1u);
        }

        // performs a 256-wide scan on vec4u in scan_arr
        fn workgroup_scan(idx : u32) {
            // upsweep pass
            if ((1u & idx) == 1u) {
                scan_arr[idx] += scan_arr[idx - 1u];
            }
            workgroupBarrier();

            if ((3u & idx) == 3u) {
                scan_arr[idx] += scan_arr[idx - 2u];
            }
            workgroupBarrier();

            if ((7u & idx) == 7u) {
                scan_arr[idx] += scan_arr[idx - 4u];
            }
            workgroupBarrier();

            if ((15u & idx) == 15u) {
                scan_arr[idx] += scan_arr[idx - 8u];
            }
            workgroupBarrier();

            if ((31u & idx) == 31u) {
                scan_arr[idx] += scan_arr[idx - 16u];
            }
            workgroupBarrier();

            // two special cases in transition from upsweep to downsweep
            if (idx == 63u) {
                scan_arr[idx] = scan_arr[31u];
            }
            workgroupBarrier();

            if (idx == 31u) {
                scan_arr[idx] = vec4u(0u);
            }
            workgroupBarrier();

            // downsweep pass
            if ((15u & idx) == 15u && (idx & 16u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 16u];
            }
            workgroupBarrier();

            if ((15u & idx) == 15u && (idx & 16u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 16u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((7u & idx) == 7u && (idx & 8u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 8u];
            }
            workgroupBarrier();

            if ((7u & idx) == 7u && (idx & 8u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 8u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((3u & idx) == 3u && (idx & 4u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 4u];
            }
            workgroupBarrier();

            if ((3u & idx) == 3u && (idx & 4u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 4u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((1u & idx) == 1u && (idx & 2u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 2u];
            }
            workgroupBarrier();

            if ((1u & idx) == 1u && (idx & 2u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 2u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((idx & 1u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 1u];
            }
            workgroupBarrier();

            if ((idx & 1u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 1u] - scan_arr[idx];
            }
            workgroupBarrier();
        }`
    }

    SCAN_UP_SRC() {
        return /* wgsl */ `
        // bindgroup specific to the intermediate scans
        @group(0) @binding(0) var<storage, read_write> low_count : array<vec4u>;
        @group(0) @binding(1) var<storage, read_write> nex_count : array<vec4u>;

        struct Uniforms {
            num : u32,
            win : u32,
            lvl : u32,
            xtr : u32
        };

        // bindgroup which stores the uniforms
        @group(1) @binding(0) var<uniform> uniforms : Uniforms; 

        // the LDS copy used in the workgroup-wide prefix scan
        var<workgroup> scan_arr : array<vec4u, 64>;

        @compute @workgroup_size(64)
        fn scan_up(
            @builtin(global_invocation_id) global_id : vec3u,
            @builtin(local_invocation_id) local_id : vec3u
        ) {
            var l_idx : u32 = local_id.x;
            var g_idx : u32 = global_id.x;
            
            // each thread reads four values from memory and performs a local scan
            var thread_vals : array<vec4u, 4>;
            var thread_offs : array<vec4u, 4>;

            for (var i : u32 = 0u; i < 4; i++) {
                var c_idx : u32 = 4u * g_idx + i;

                if (c_idx < uniforms.num) {
                    thread_vals[i] = low_count[4u * g_idx + i];
                }
            }

            thread_offs[0] = vec4u(0u, 0u, 0u, 0u);
            thread_offs[1] = thread_vals[0];
            thread_offs[2] = thread_offs[1] + thread_vals[1];
            thread_offs[3] = thread_offs[2] + thread_vals[2];

            // perform the workgroup-wide prefix scan
            scan_arr[l_idx] = thread_vals[0] + thread_vals[1] + thread_vals[2] + thread_vals[3];
            workgroupBarrier();

            workgroup_scan(l_idx);

            // complete the local scan and send it back to storage
            for (var i : u32 = 0u; i < 4; i++) {
                low_count[4u * g_idx + i] = scan_arr[l_idx] + thread_offs[i];
            }

            // if we are the last thread in the group, send the total # to the next layer
            if (l_idx == 63u) {
                nex_count[g_idx / 64u] = scan_arr[63u] + thread_offs[3] + thread_vals[3];
            }
        }

        // performs a 256-wide scan on vec4u in scan_arr
        fn workgroup_scan(idx : u32) {
            // upsweep pass
            if ((1u & idx) == 1u) {
                scan_arr[idx] += scan_arr[idx - 1u];
            }
            workgroupBarrier();

            if ((3u & idx) == 3u) {
                scan_arr[idx] += scan_arr[idx - 2u];
            }
            workgroupBarrier();

            if ((7u & idx) == 7u) {
                scan_arr[idx] += scan_arr[idx - 4u];
            }
            workgroupBarrier();

            if ((15u & idx) == 15u) {
                scan_arr[idx] += scan_arr[idx - 8u];
            }
            workgroupBarrier();

            if ((31u & idx) == 31u) {
                scan_arr[idx] += scan_arr[idx - 16u];
            }
            workgroupBarrier();

            // two special cases in transition from upsweep to downsweep
            if (idx == 63u) {
                scan_arr[idx] = scan_arr[31u];
            }
            workgroupBarrier();

            if (idx == 31u) {
                scan_arr[idx] = vec4u(0u);
            }
            workgroupBarrier();

            // downsweep pass
            if ((15u & idx) == 15u && (idx & 16u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 16u];
            }
            workgroupBarrier();

            if ((15u & idx) == 15u && (idx & 16u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 16u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((7u & idx) == 7u && (idx & 8u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 8u];
            }
            workgroupBarrier();

            if ((7u & idx) == 7u && (idx & 8u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 8u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((3u & idx) == 3u && (idx & 4u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 4u];
            }
            workgroupBarrier();

            if ((3u & idx) == 3u && (idx & 4u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 4u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((1u & idx) == 1u && (idx & 2u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 2u];
            }
            workgroupBarrier();

            if ((1u & idx) == 1u && (idx & 2u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 2u] - scan_arr[idx];
            }
            workgroupBarrier();

            if ((idx & 1u) != 0u) {
                scan_arr[idx] = scan_arr[idx] + scan_arr[idx - 1u];
            }
            workgroupBarrier();

            if ((idx & 1u) == 0u) {
                scan_arr[idx] = scan_arr[idx + 1u] - scan_arr[idx];
            }
            workgroupBarrier();
        }`
    }
}
