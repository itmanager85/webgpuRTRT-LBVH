class Scene {
    cubes = [];

    load_cubes( tris ) {
        let num_cubes = tris.length / (6*2 * (48/4));
        this.cubes = [];
        for (let i = 0; i<num_cubes; i++) {
            let cube = new Cube();
            cube.setFromF32Array( tris.slice(i * 6*2 * (48/4), (i+1)* 6*2 * (48/4))) ;
            this.cubes.push(cube);
        }
    }

    random_cubes_phi_delta () {
        for (let i = 0; i<this.cubes.length; i++) {
            this.cubes[i].random_phi_delta();
        }
    }

    update_rotation(){
        for (let i = 0; i<this.cubes.length; i++) {
            this.cubes[i].update_rotation();
        }
    }

    get_bounds() {

        let BOUNDS = {
            min: [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
            max: [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE]
        } 

        for (let i = 0; i<this.cubes.length; i++) {
            let tri_bounds = this.cubes[i].get_bounds();

            BOUNDS.min[0] = Math.min(BOUNDS.min[0], tri_bounds.min[0])
            BOUNDS.min[1] = Math.min(BOUNDS.min[1], tri_bounds.min[1])
            BOUNDS.min[2] = Math.min(BOUNDS.min[2], tri_bounds.min[2])

            BOUNDS.max[0] = Math.min(BOUNDS.max[0], tri_bounds.max[0])
            BOUNDS.max[1] = Math.max(BOUNDS.max[1], tri_bounds.max[1])
            BOUNDS.max[2] = Math.max(BOUNDS.max[2], tri_bounds.max[2])
        }

        return BOUNDS;
    }
}