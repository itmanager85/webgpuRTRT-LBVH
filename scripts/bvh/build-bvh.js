class BVHTree {

    device = null;

    aabb_update;
    scene_bounds;

    aabb_z_idx;
    radix_sort;
    radix_tree;
    bvhUpPass;
    rearrange;

    TRI_ARRAY;
    NUM_TRIS;
    BOUNDS;

    I_TRIANGE_BUFFER; // WGSL

    constructor( device ) {

        if ( null == device ) {
            return false;
        }

        this.device = device;

        this.aabb_update = new AABB_UPDATE(device);
        this.scene_bounds = new SCENE_BOUNDS(device);

        this.aabb_z_idx = new AABB_Z_IDX(device)
        this.radix_sort = new RadixSort(device)
        this.radix_tree = new RadixTree(device)

        this.clear_buffer_bvh = new ClearBuffer(device)
        this.bvhUpPass  = new BVH_UP_PASS(device)

        this.rearrange  = new Rearrange(device)
    }

    prepare_buffers( TRI_ARRAY, NUM_TRIS, MODEL_BOUNDS ) {
        this.prepare_triangle_buffer( TRI_ARRAY, NUM_TRIS, MODEL_BOUNDS );
        this.prepare_kernel_buffers();
    }

    prepare_triangle_buffer( TRI_ARRAY, NUM_TRIS, MODEL_BOUNDS ) {

        this.TRI_ARRAY = TRI_ARRAY;
        this.NUM_TRIS = NUM_TRIS;
        this.BOUNDS = MODEL_BOUNDS;

        // create GPU triangle buffer and copy values to it
        this.I_TRIANGE_BUFFER = this.device.createBuffer({
            size: NUM_TRIS * 48,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        })

        new Float32Array(this.I_TRIANGE_BUFFER.getMappedRange()).set(TRI_ARRAY)
        this.I_TRIANGE_BUFFER.unmap()
    }

    update_triangles_in_gpu_buffer( offset, tris_upd, num_tris ) {

        this.device.queue.writeBuffer(
            this.I_TRIANGE_BUFFER,
            offset * 48,
            tris_upd,
            0,
            num_tris * (48/4) // 48
        )
    }


    prepare_kernel_buffers() {

        this.aabb_update.prepare_buffers( this.I_TRIANGE_BUFFER, this.NUM_TRIS );
        this.scene_bounds.prepare_buffers( this.aabb_update.AABB_BUFFER, this.NUM_TRIS );

        this.aabb_z_idx.prepare_buffers( this.aabb_update.AABB_BUFFER, this.NUM_TRIS, this.scene_bounds.UNIFORM_BUFFER );

        this.radix_sort.prepare_buffers( this.aabb_z_idx.Z_IDX_BUFFER, this.NUM_TRIS );
        this.radix_tree.prepare_buffers( this.aabb_z_idx.Z_IDX_BUFFER, this.NUM_TRIS );

        this.bvhUpPass.prepare_buffers( this.radix_sort.IDX_BUFFER, this.aabb_z_idx.AABB_BUFFER, this.radix_tree.PARENT_BUFFER, this.NUM_TRIS );
        this.clear_buffer_bvh.prepare_buffers(this.bvhUpPass.BVH_BUFFER, this.bvhUpPass.BVH_BUFFER.size/4, 0)

        this.rearrange.prepare_buffers( this.I_TRIANGE_BUFFER, this.radix_sort.IDX_BUFFER, this.NUM_TRIS );
    }

    BVH_BUFFER = null;
    O_TRIANGLE_BUFFER = null;

    async build () {

        // compute & update bounds in real time in wgsl compute shaders
        // compute AABB_BOUNDS
        await this.aabb_update.execute();
        // reduce SCENE_BOUNDS
        await this.scene_bounds.execute();

        // compute AABB and morton code for each triangle
        //const { AABB_BUFFER, Z_IDX_BUFFER } = 
        await this.aabb_z_idx.execute();

        // sort the morton code buffer and store how indices change
        //const { IDX_BUFFER } = 
        await this.radix_sort.execute()

        // compute the radix tree over the morton codes
        //const { PARENT_BUFFER } = 
        await this.radix_tree.execute()

        const { BVH_BUFFER } = await this.bvhUpPass.execute()

        // rearrange the triangles
        const { O_TRIANGLE_BUFFER } = await this.rearrange.execute()

        this.BVH_BUFFER = BVH_BUFFER;
        this.O_TRIANGLE_BUFFER = O_TRIANGLE_BUFFER;

        return { BVH_BUFFER, O_TRIANGLE_BUFFER }
    }

    async rebuild () {

        // ms for 219k triangles num (on iGPU)

        // compute & update bounds in real time in wgsl compute shaders
        // compute AABB_BOUNDS
        await this.aabb_update.execute();
        // reduce SCENE_BOUNDS
        await this.scene_bounds.execute();

        // compute AABB and morton code for each triangle
        // 1 ms
        await this.aabb_z_idx.execute();

        // пишет в Z_IDX_BUFFER буффер
        // sort the morton code buffer and store how indices change
        // 4 ms
        await this.radix_sort.execute()

        // compute the radix tree over the morton codes
        // 6 ms
        await this.radix_tree.execute()

        // 0.5 ms
        await this.clear_buffer_bvh.init(0) //or await this.bvhUpPass.clear_BVH_BUFFER(); // 1.5 ms

        // 1.5 ms
        await this.bvhUpPass.execute()

        // rearrange the triangles
        // 0.5 ms
        await this.rearrange.execute()
    }
}
