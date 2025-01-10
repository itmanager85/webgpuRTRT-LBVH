class Cube {
    faces = new Float32Array(6*2 * 48/4);

    center = new Float32Array(4);

    phi = 0.0;
    phi_delta = 0.01;

    faces_animate = new Float32Array(6*2 * 48/4);

    flag_rotate_around_center = true;

    setFromF32Array(tris){
        this.faces = new Float32Array(tris.slice());

        this.center = new Float32Array([0.0, 0.0, 0.0, 1.0]);

        for (let i = 0; i<6*2*3; i++) {
            this.center[0] += this.faces[i * 4 + 0];
            this.center[1] += this.faces[i * 4 + 1];
            this.center[2] += this.faces[i * 4 + 2];
            this.center[3] += this.faces[i * 4 + 3];
        }

        this.center[0] /= 6*2*3;
        this.center[1] /= 6*2*3;
        this.center[2] /= 6*2*3;
        this.center[3] /= 6*2*3;
    }

    rotationZ( phi ) {

        if ( !this.faces ) {
            return false;
        }

        if ( this.phi_delta > 0) {
            if ( phi >= 2.0 * Math.PI ) {
                phi = 0.0;
            } 
        } else if ( this.phi_delta < 0) {
            if ( phi <= -2.0 * Math.PI ) {
                phi = 0.0;
            }
        }

        this.phi = phi;

        for (let i = 0; i<6*2*3; i++) {

            let x0 = this.faces[i * 4 + 0];
            let y0 = this.faces[i * 4 + 1];
            let z0 = this.faces[i * 4 + 2];

            this.faces_animate[i * 4 + 0] = x0 * Math.cos(phi) + y0 * Math.sin(phi);
            this.faces_animate[i * 4 + 1] = x0 * (-Math.sin(phi)) + y0 * Math.cos(phi);
            this.faces_animate[i * 4 + 2] = z0;
        }
    }

    rotX = 0;

    rotation_X_Z_around_scene_center( phi, rotX ){

        if ( !this.faces || !this.center) {
            return false;
        }

        /*
        if ( this.phi > 0) {
            if ( phi >= 2.0 * Math.PI ) {
                phi = 0.0;
            } 
        } else if ( this.phi < 0) {
            if ( phi <= -2.0 * Math.PI ) {
                phi = 0.0;
            }
        }
        */

        this.phi = phi;
        this.rotX = rotX;

        for (let i = 0; i<6*2*3; i++) {

            //const {x0, y0, z0} = this.position; // не работает
            let x0 = this.faces[i * 4 + 0] - this.center[0];
            let y0 = this.faces[i * 4 + 1] - this.center[1];
            let z0 = this.faces[i * 4 + 2] - this.center[2];

            //rotate X
            let x1 = x0;
            let y1 = y0 * Math.cos(rotX) + z0 * Math.sin(rotX);
            let z1 = y0 * (-Math.sin(rotX)) + z0 * Math.cos(rotX);

            //rotate Z
            let x2 = x1 * Math.cos(phi) + y1 * Math.sin(phi);
            let y2 = x1 * (-Math.sin(phi)) + y1 * Math.cos(phi);
            let z2 = z1;

            this.faces_animate[i * 4 + 0] = this.center[0] + x2;
            this.faces_animate[i * 4 + 1] = this.center[1] + y2;
            this.faces_animate[i * 4 + 2] = this.center[2] + z2;
        }
    }

    update_rotation(){ // 

        if ( !this.faces ) {
            return false;
        }

        if ( this.flag_rotate_around_center ) {
            //this.rotation_Z_around_scene_center( this.phi + this.phi_delta );
            this.rotation_X_Z_around_scene_center( this.phi + this.phi_delta, this.rotX + this.phi_delta );
        } else {
            this.rotationZ( this.phi + this.phi_delta );
        }
    }

    random_phi_delta () {
        let phi_delta = this.phi_delta * Math.random() * 3.0; // (-0.005 + Math.random() * 0.01);
        this.phi_delta = Math.max( 0.008, Math.min(phi_delta, 0.05) )
    }

    get_bounds() {
        let BOUNDS = {
            min: [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
            max: [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE]
        } 

        for (let i = 0; i<6*2*3; i++) {

            let x0 = this.faces_animate[i * 4 + 0];
            let y0 = this.faces_animate[i * 4 + 1];
            let z0 = this.faces_animate[i * 4 + 2];

            BOUNDS.min[0] = Math.min(BOUNDS.min[0], x0)
            BOUNDS.min[1] = Math.min(BOUNDS.min[1], y0)
            BOUNDS.min[2] = Math.min(BOUNDS.min[2], z0)

            BOUNDS.max[0] = Math.min(BOUNDS.max[0], x0)
            BOUNDS.max[1] = Math.max(BOUNDS.max[1], y0)
            BOUNDS.max[2] = Math.max(BOUNDS.max[2], z0)
        }

        return BOUNDS;
    }

}