function cross (a, b) {
    return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v){
    const invLen = 1.0 / Math.sqrt(dot(v,v));
    return [ v[0] * invLen, v[1] * invLen, v[2] * invLen ];
}

function minus(a, b) {
    return [ a[0] - b[0], a[1] - b[1], a[2] - b[2] ];
}

function plus(a, b) {
    return [ a[0] + b[0], a[1] + b[1], a[2] + b[2] ];
}

function negate(a) {
    return [ -a[0], -a[1], -a[2] ];
}

function mul_num(v, b){
    return [ v[0] * b, v[1] * b, v[2] * b ];
}


class Camera {

    lookAt = [0.0, 0.0, 0.0];

    alpha = 0.0;
    beta = 0.0;

    radius = 10.0;
    up_base = [ 0.0, 0.0, -1.0 ];

    position = [0.0, 0.0, 1.0 ];

    dir = [-1, 0, 0]; //camera_dir;
    right = [0, 1, 0]; //camera_right;
    up = [ 0.0, 1.0, 0.0 ];

    delta = 0.1;

    init (lookAt, alpha, beta, distance, delta = 0.1){

        this.lookAt = lookAt;

        this.alpha = alpha;
        this.beta = beta;

        this.radius = distance;

        this.delta = delta;

        this.update();
    }

    set_sperical( dist, phi, theta ) {
        this.alpha = phi;
        this.beta = theta;
        this.radius = dist;

        this.update();
    }

    add_radius(dr){
        this.radius += dr;
        this.update();
    }

    add_rotate(da, db) {
        this.alpha += da;
        this.beta += db;
        this.update();
    }

    update() {

        // Compute
        const cosa = Math.cos(this.alpha);
        const sina = Math.sin(this.alpha);
        const cosb = Math.cos(this.beta);
        let sinb = Math.sin(this.beta);

        if (sinb === 0) {
            sinb = 0.0001;
        }

        if (this.radius === 0) {
            this.radius = 0.0001; // Just to avoid division by zero
        }

        let computationVector = [this.radius * sinb * cosa, this.radius * sinb * sina, this.radius * cosb];

        this.position = plus(this.lookAt, computationVector);

        let UP = this.up_base;
        if (sinb < 0) {
            UP = negate(this.up_base);
        }

         // center - eye
        this.dir = normalize ( minus(this.lookAt, this.position) );
	    this.right = normalize ( cross( this.dir, UP ) );
        this.up = normalize(negate(cross(this.dir, this.right)));
    }
}