class BVH_UP_PASS {
    
    // shader parameters
    WG_SIZE = 64

    // предельное количество треугольников в сцене 
    MAX_TRIANGLES_COUNT = 2_100_000;

    device = null;

    SM = null
    BG_LAYOUTS = null
    PIPELINE = null

    IDX_BUFFER = null
    AABB_BUFFER = null
    PARENT_BUFFER = null

    // текущее количество треугольников в сцене 
    size = 0

    constructor( device ) {
        this.init( device )
    }

    init( device ) {

        if ( null == device ) {
            return false;
        }

        this.device = device;

        // create bind group layouts, shader module and pipeline
        this.BG_LAYOUTS = [
            this.device.createBindGroupLayout({
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
            this.device.createBindGroupLayout({
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
                    },
                ]
            })
        ]

        this.SM = this.device.createShaderModule({
            code: this.SRC(),
            label: "radix tree shader module"
        })
    
        this.PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: this.BG_LAYOUTS
            }),
            compute: {
                module: this.SM,
                entryPoint: "bvh_upward_pass"
            }
        })

        return true;
    }

    BVH_BUFFER = null
    UNIFORM_BUFFER = null
    BGS = null

    // зарезервированное место под буферы (BVH_BUFFER), максимальное количество треугольников (под которые уже выделена память)
    reserved_size = 0;

    // временно, массив для началной инициализации BVH_BUFFER (когда другие входящие данные подверглись обновилению)
    //TEMP_F32_ARRAY = null

    hard_reset_size(IDX_BUFFER, AABB_BUFFER, PARENT_BUFFER, size) {

        if (size < 0 || size > this.MAX_TRIANGLES_COUNT) { // 1M (max)
            return false;
        }

        this.IDX_BUFFER = IDX_BUFFER;
        this.AABB_BUFFER = AABB_BUFFER;
        this.PARENT_BUFFER = PARENT_BUFFER;
        this.size = size;
        this.reserved_size = size;

        // create all the necessary buffers
        this.BVH_BUFFER = this.device.createBuffer({
            size: size * 64,

            // for debug
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC  // Set the appropriate buffer usage
        })

        //this.TEMP_F32_ARRAY = new Float32Array(size*(64/4)).fill(0.0); // Fill with 0.0

        this.UNIFORM_BUFFER = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        this.BGS = [
            this.device.createBindGroup({
                layout: this.BG_LAYOUTS[0],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: IDX_BUFFER
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: AABB_BUFFER
                        }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: PARENT_BUFFER
                        }
                    }
                ]
            }),
            this.device.createBindGroup({
                layout: this.BG_LAYOUTS[1],
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        resource: {
                            buffer: this.BVH_BUFFER
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
        ]

        this.device.queue.writeBuffer(
            this.UNIFORM_BUFFER,
            0,
            new Int32Array([
                size,
                0,
                0,
                0
            ])
        )

        return true;
    }

    // not used
    update(IDX_BUFFER, AABB_BUFFER, PARENT_BUFFER, size, flag_upd_BVH_BUFFER = false, flag_double_reserve = true) {

        let flag_update_all = false;

        // если входящие массивы другие (хотя бы один), то полное обновление
        if ( this.IDX_BUFFER !== IDX_BUFFER || this.AABB_BUFFER !== AABB_BUFFER || this.PARENT_BUFFER !== PARENT_BUFFER) {
            flag_update_all = true;
        }

        // если массивы те же, и не сказано что данные в них другие (при том же их размере), то выходим
        if ( this.size == size && !(flag_update_all || flag_upd_BVH_BUFFER)) {
            return false;
        }

        // размер массива не должен превышать 1M
        if (size < 0 || size > this.MAX_TRIANGLES_COUNT) { // 1M (max)
            return false;
        }

        if (size > this.reserved_size || flag_update_all) {

            // если зарезервированного объёма данных не хватает, то резервируем в 2 раза больше чем требуется сейчас
            const reserve_coeff = flag_double_reserve ? (size * 2) : size;

            // но не больше 2.1M (max)
            const new_reserved_size = Math.min( reserve_coeff, this.MAX_TRIANGLES_COUNT );

            // пересоздаём буферы и привязки к PIPELINE
            if (!this.hard_reset_size(IDX_BUFFER, AABB_BUFFER, PARENT_BUFFER, new_reserved_size)) {
                return false;
            }

            // если количество треугольников в сцене изменилось (или они сами), то переинициализируем начальное состояние выходного буфера
        } else if (this.size != size || flag_upd_BVH_BUFFER) {

            // переделать !!
            // заполнение (max, min)?
            this.clear_BVH_BUFFER(size); 
        }

        // update, обновляем текущее значение количества примитивов (треугольников)
        this.device.queue.writeBuffer(
            this.UNIFORM_BUFFER,
            0,
            new Int32Array([
                size,
                0,
                0,
                0
            ])
        )

        this.size = size;

        return true;
    }

    prepare_buffers( IDX_BUFFER, AABB_BUFFER, PARENT_BUFFER, NUM_TRIS ) {
        this.hard_reset_size(IDX_BUFFER, AABB_BUFFER, PARENT_BUFFER, NUM_TRIS);
    }

    async execute() { 

        const CE = this.device.createCommandEncoder()
        const  P = CE.beginComputePass()

        P.setPipeline(this.PIPELINE)
        P.setBindGroup(0, this.BGS[0])
        P.setBindGroup(1, this.BGS[1])
        P.dispatchWorkgroups(Math.ceil(this.size / this.WG_SIZE))
        P.end()

        this.device.queue.submit([CE.finish()])

        return { BVH_BUFFER : this.BVH_BUFFER }
    }

    // not use
    async re_execute() { 
        await this.clear_BVH_BUFFER();
        return await this.execute();
    }

    // not use 
    async clear_BVH_BUFFER() {
        const data = new Float32Array(this.size*16).fill(0.0); // Fill with 0.0
        this.device.queue.writeBuffer( this.BVH_BUFFER, 0, data );
    }

    SRC() {
        return /* wgsl */ `

        struct BVHNode {
            aabb_l_min_x : atomic<i32>,
            aabb_l_min_y : atomic<i32>,
            aabb_l_min_z : atomic<i32>,
                 l_child : atomic<i32>,
            aabb_l_max_x : atomic<i32>,
            aabb_l_max_y : atomic<i32>,
            aabb_l_max_z : atomic<i32>,
                     f_1 : atomic<i32>, // Used for synchronization
            aabb_r_min_x : atomic<i32>,
            aabb_r_min_y : atomic<i32>,
            aabb_r_min_z : atomic<i32>,
                 r_child : atomic<i32>,
            aabb_r_max_x : atomic<i32>,
            aabb_r_max_y : atomic<i32>,
            aabb_r_max_z : atomic<i32>,
            f_2 : atomic<i32>
        };

        struct AABB {
            min : vec3f,
            max : vec3f
        };

        struct Uniforms {
            num : i32,
            f_1 : i32,
            f_2 : i32,
            f_3 : i32
        };

        @group(0) @binding(0) var<storage, read_write>   idx_arr : array<i32>;
        @group(0) @binding(1) var<storage, read_write>  aabb_arr : array<AABB>;
        @group(0) @binding(2) var<storage, read_write>   par_arr : array<i32>;

        @group(1) @binding(0) var<storage, read_write> bvh : array<BVHNode>;
        @group(1) @binding(1) var<uniform> uniforms : Uniforms;

        @compute @workgroup_size(${this.WG_SIZE})
        fn bvh_upward_pass(@builtin(global_invocation_id) global_id : vec3u) {    
            var idx : i32 = i32(global_id.x);
            if (idx >= uniforms.num) {
                return;
            }
        
            var bbox : AABB = aabb_arr[idx_arr[idx]];

            // slightly perturb the bounding box position for check on line ~266
            bbox.min -= vec3f(bbox.min == vec3f(0.)) * vec3f(1e-8f);
            bbox.max += vec3f(bbox.max == vec3f(0.)) * vec3f(1e-8f);

            var c_idx : i32 = idx;
            var w_idx : i32 = -(idx + 1);
            var level : i32 = 0;

            var bSkipped : bool = false;
        
            while ((w_idx != 0 || level == 0) && !bSkipped) {
                var p_idx : i32;
                if (level == 0) {
                    p_idx = par_arr[c_idx + uniforms.num];
                } else {
                    p_idx = par_arr[c_idx];
                }

                if (!bSkipped) {
                    var sibling : i32;
                    
                    if (!bSkipped) {
                        sibling = atomicAdd(&bvh[p_idx].f_1, 1);
                    } 

                    if (sibling == 0 && !bSkipped) {
                        atomicStore(&bvh[p_idx].aabb_l_min_x, bitcast<i32>(bbox.min.x));
                        atomicStore(&bvh[p_idx].aabb_l_min_y, bitcast<i32>(bbox.min.y));
                        atomicStore(&bvh[p_idx].aabb_l_min_z, bitcast<i32>(bbox.min.z));
                        atomicStore(&bvh[p_idx].aabb_l_max_x, bitcast<i32>(bbox.max.x));
                        atomicStore(&bvh[p_idx].aabb_l_max_y, bitcast<i32>(bbox.max.y));
                        atomicStore(&bvh[p_idx].aabb_l_max_z, bitcast<i32>(bbox.max.z));
                        atomicStore(&bvh[p_idx].l_child, w_idx);

                        bSkipped = true;
                    }

                    if (sibling != 0 && !bSkipped) {
                        atomicStore(&bvh[p_idx].aabb_r_min_x, bitcast<i32>(bbox.min.x));
                        atomicStore(&bvh[p_idx].aabb_r_min_y, bitcast<i32>(bbox.min.y));
                        atomicStore(&bvh[p_idx].aabb_r_min_z, bitcast<i32>(bbox.min.z));
                        atomicStore(&bvh[p_idx].aabb_r_max_x, bitcast<i32>(bbox.max.x));
                        atomicStore(&bvh[p_idx].aabb_r_max_y, bitcast<i32>(bbox.max.y));
                        atomicStore(&bvh[p_idx].aabb_r_max_z, bitcast<i32>(bbox.max.z));
                        atomicStore(&bvh[p_idx].r_child, w_idx);

                        var l_min : vec3f = vec3f(
                            bitcast<f32>(atomicLoad(&bvh[p_idx].aabb_l_min_x)),
                            bitcast<f32>(atomicLoad(&bvh[p_idx].aabb_l_min_y)),
                            bitcast<f32>(atomicLoad(&bvh[p_idx].aabb_l_min_z))
                        );
                        var l_max : vec3f = vec3f(
                            bitcast<f32>(atomicLoad(&bvh[p_idx].aabb_l_max_x)),
                            bitcast<f32>(atomicLoad(&bvh[p_idx].aabb_l_max_y)),
                            bitcast<f32>(atomicLoad(&bvh[p_idx].aabb_l_max_z))
                        );

                        // don't do anything if the other is not loaded yet
                        if (any(l_min == vec3f(0.)) || any(l_max == vec3f(0.))) {
                            continue;
                        }

                        bbox.min = min(bbox.min, l_min);
                        bbox.max = max(bbox.max, l_max);

                        // Move to parent
                        c_idx = p_idx;
                        w_idx = p_idx;
                        level += 1;
                    }
                }
            }
        }`
    }
}



