class PointLight {

    position = null;
    color = [1.0, 1.0, 1.0];

    phi = 0.0;
    phi_delta = 0.01;

    flag_animate = false;

    flag_safe_animation = false;

    position_animate = [1.0, 1.0, 1.0];

    constructor(light_pos, light_color = [1.0, 1.0, 1.0]) {

        this.init(light_pos, light_color);
    }

    init ( light_pos, light_color = [1.0, 1.0, 1.0] ){

        this.position = light_pos;
        this.light_color = light_color;

        this.phi = 0.0;
        this.phi_delta = 0.01;

        this.flag_animate = false;
        this.flag_safe_animation = false;

        this.position_animate = [1.0, 1.0, 1.0];

        this.scene_center = [0.0, 0.0, 0.0];
        this.flag_rotate_around_center = false;
    }

    rotationZ( phi ){

        if ( !this.position ) {
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

        let x0 = this.position[0];
        let y0 = this.position[1];
        let z0 = this.position[2];

        this.position_animate[0] = x0 * Math.cos(phi) + y0 * Math.sin(phi);
        this.position_animate[1] = x0 * (-Math.sin(phi)) + y0 * Math.cos(phi);
        this.position_animate[2] = z0;
   }

    scene_center = [0.0, 0.0, 0.0];
    flag_rotate_around_center = false;

    set_scene_center (scene_center, flag_rotate_around_center = true) {

        if (!scene_center) {
            this.scene_center = null;
            return false;
        }

        this.scene_center = [0.0, 0.0, 0.0]

        this.scene_center[0] = scene_center[0];
        this.scene_center[1] = scene_center[1];
        this.scene_center[2] = scene_center[2];

        this.flag_rotate_around_center = flag_rotate_around_center;
    }

    set_center_from_bounds(BOUNDS, flag_animate = false) {
        let dist = [
                BOUNDS.max[0] - BOUNDS.min[0],
                BOUNDS.max[1] - BOUNDS.min[1],
                BOUNDS.max[2] - BOUNDS.min[2],
        ]
    
        let lookAt = [
            (BOUNDS.min[0] + BOUNDS.max[0]) * .5,
            (BOUNDS.min[1] + BOUNDS.max[1]) * .5,
            (BOUNDS.min[2] + BOUNDS.max[2]) * .5,
        ]

        this.set_scene_center( lookAt );

        if ( flag_animate ) {
            this.position = [lookAt[0] + dist[0]/2, lookAt[1] + dist[1]/2, lookAt[2] + dist[2]]
        } else {
            this.position = [lookAt[0], lookAt[1], lookAt[2] +  + dist[2] / 2.0 * 2.0] // 3.0
        }

    }

    rotation_Z_around_scene_center( phi ){

        if ( !this.position || !this.scene_center) {
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

        let x0 = this.position[0] - this.scene_center[0];
        let y0 = this.position[1] - this.scene_center[1];
        let z0 = this.position[2];

        this.position_animate[0] = this.scene_center[0] + x0 * Math.cos(phi) + y0 * Math.sin(phi);
        this.position_animate[1] = this.scene_center[1] + x0 * (-Math.sin(phi)) + y0 * Math.cos(phi);
        this.position_animate[2] = z0;
    }

    add_rotationZ(phi_delta = 0.01){

        if ( !this.position ) {
            return false;
        }

        if ( this.flag_rotate_around_center ) {
            this.rotation_Z_around_scene_center( this.phi + phi_delta );
        } else {
            this.rotationZ( this.phi + phi_delta );
        }
    }

    set_rotation_delta(phi_delta = 0.01) {
        this.phi_delta = phi_delta;
    }

    animate(){

        if ( !this.flag_animate ) {
            return false;
        }

        this.flag_safe_animation = true;

        this.add_rotationZ (this.phi_delta);
    }

    get_position() {
        if (this.flag_animate || this.flag_safe_animation) {
            return this.position_animate;
        } else {
            return this.position;
        }
    }

    activate_animate(phi_delta = 0.01){ // 

        this.set_rotation_delta(phi_delta);

        this.flag_animate = true;
    }

    deactivate_animate(flag_safe_animation = true){
        this.flag_animate = false;
        this.flag_safe_animation = flag_safe_animation;
    }
}