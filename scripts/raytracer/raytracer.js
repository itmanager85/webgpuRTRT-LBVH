//class Raytracer {}

    function initRayTracer(device, canvas, bvh) {

        const FOV = 60.;
        const THETA = (FOV*3.1415*0.5) / 180.0;
        const HALF_WIDTH = Math.tan( THETA );

        const CANVAS = initCanvas(device, canvas)

        const ASPECT = (1.0 * CANVAS.w) / (1.0 * CANVAS.h);


        const u0 = -HALF_WIDTH * ASPECT;
        const v0 = -HALF_WIDTH;
        const u1 =  HALF_WIDTH * ASPECT;
        const v1 =  HALF_WIDTH;
        const dist_to_image = 1.0;

        let  phi = 90.0 * Math.PI/180.0 

        let  rot = 50.0 * Math.PI/180.0
        let dist  = 1.5 * Math.max(
            Math.max(
                bvh.BOUNDS.max[0] - bvh.BOUNDS.min[0],
                bvh.BOUNDS.max[1] - bvh.BOUNDS.min[1]
            ),
            bvh.BOUNDS.max[2] - bvh.BOUNDS.min[2]
        )
    
        let lookAt = [
            (bvh.BOUNDS.min[0] + bvh.BOUNDS.max[0]) * .5,
            (bvh.BOUNDS.min[1] + bvh.BOUNDS.max[1]) * .5,
            (bvh.BOUNDS.min[2] + bvh.BOUNDS.max[2]) * .5,
        ]
        let position = [
            lookAt[0] + Math.cos(rot) * dist,
            lookAt[1] + Math.sin(rot) * dist,
            lookAt[2]
        ]

        let light_pos_default = [lookAt[0], lookAt[1], lookAt[2] + Math.abs(lookAt[2]) * 5]
        let light_color_default = [1.0, 1.0, 1.0]

        let bounds_size = minus(bvh.BOUNDS.max, bvh.BOUNDS.min);
        let bounds_avg_size = (bounds_size[0] + bounds_size[1] + bounds_size[2])/3.0;

        //let delta = 0.1;
        let delta = bounds_avg_size / 500;
    
        let camera = new Camera();
        camera.init(lookAt, phi, rot, dist, delta);

        const { VS, FS, CS } = SRC()

        // нужна ли смена буферов ? 
        const tTexture = device.createTexture({size: [CANVAS.w, CANVAS.h], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING});

        const DRAW_SM = device.createShaderModule({
            code: VS + FS
        })

        const DRAW_BG_LAYOUT = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "unfilterable-float", 
                        viewDimension: "2d", 
                        multisampled: false
                    }
                }
            ]
        })

        const DRAW_BG = device.createBindGroup({
                layout: DRAW_BG_LAYOUT, entries: [
                    {
                        binding: 0, 
                        resource: tTexture.createView()
                    }
                ]
            })

        const DRAW_PIPELINE = device.createRenderPipeline({
            layout: device.createPipelineLayout({bindGroupLayouts: [DRAW_BG_LAYOUT]}),
            vertex: {
                module: DRAW_SM,
                entryPoint: "vs"
            },
            fragment: {
                module: DRAW_SM,
                entryPoint: "fs",
                targets: [
                    {
                        format: CANVAS.presentationFormat
                    }
                ]
            }
        })
    
        const PT_O_BG_LAYOUT = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0, 
                    visibility: GPUShaderStage.COMPUTE, 
                    storageTexture: {
                        format: "rgba32float", 
                        viewDimension: "2d"
                    }
                }
            ],
            label: "PT_O_BG_LAYOUT"
        })

        const PT_O_BG = device.createBindGroup({
                layout: PT_O_BG_LAYOUT,
                entries: [
                    {
                        binding: 0, 
                        resource: tTexture.createView()
                    }
                ]
            })

        const PT_BVH_BG_LAYOUT = device.createBindGroupLayout({
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
        })
    
        const PT_BVH_BG = device.createBindGroup({
            layout: PT_BVH_BG_LAYOUT,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: bvh.BVH_BUFFER
                    }
                },
                {
                    binding: 1,
                    resource: {
                        buffer: bvh.O_TRIANGLE_BUFFER
                    }
                }
            ]
        })
    
        const PT_UNI_BG_LAYOUT = device.createBindGroupLayout({
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
    
        const UNIFORM_BUFFER = device.createBuffer({
            size: 32 *4 + 4*4 + 8 *4, // 144, //32 *5, // 
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
        })
    
        const PT_UNI_BG = device.createBindGroup({
            layout: PT_UNI_BG_LAYOUT,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: UNIFORM_BUFFER
                    }
                }
            ]
        })
    
        const PT_SM = device.createShaderModule({
            code: CS
        })
    
        const PT_PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [PT_O_BG_LAYOUT, PT_BVH_BG_LAYOUT, PT_UNI_BG_LAYOUT]
            }),
            compute: {
                module: PT_SM,
                entryPoint: "main"
            }
        })

        return { draw, sample, rotateView, camera }

        async function sample( raytrace_depth, shadow_depth, light_pos, light_color ) {

            if (!light_pos) {
                light_pos = light_pos_default;
            }

            if (!light_color) {
                light_color = light_color_default;
            }

            const a = mul_num(camera.right, (u1-u0));
	        const b = mul_num(camera.up, (v1-v0));

            const temp1 = plus( camera.position, mul_num(camera.right, u0) );
            const temp2 = plus( mul_num(camera.up, v0), mul_num(camera.dir, dist_to_image) );
	        const c = plus(temp1, temp2);

            device.queue.writeBuffer(
                UNIFORM_BUFFER,
                0,
                new Float32Array([
                    position[0], position[1], position[2], // vec3f
                    0,
                    lookAt[0], lookAt[1], lookAt[2], //0. // vec3f
                    0.0,

                    0., 0., 0., 1.0, //color : vec4f,
                    CANVAS.w, //width 
                    CANVAS.h, //height
                    1., //uULen : f32,
                    1., //uVLen : f32,

                    a[0], a[1], a[2], 0.0,
                    b[0], b[1], b[2], 0.0,
                    c[0], c[1], c[2], 0.0,
                    camera.position[0], camera.position[1], camera.position[2], 0.0,

                    1.0 * raytrace_depth, 
                    1.0 * (shadow_depth <= raytrace_depth ? shadow_depth : raytrace_depth),
                    0.0,
                    0.0,
                    light_pos[0], light_pos[1], light_pos[2], 0.0,
                    light_color[0], light_color[1], light_color[2], 0.0
                ])
            )
    
            const CE = device.createCommandEncoder()
            const  P = CE.beginComputePass()
            P.setPipeline(PT_PIPELINE)
            P.setBindGroup(0, PT_O_BG)
            P.setBindGroup(1, PT_BVH_BG)
            P.setBindGroup(2, PT_UNI_BG)
            P.dispatchWorkgroups(Math.ceil(CANVAS.w / 8), Math.ceil(CANVAS.h / 8))
            P.end()
    
            device.queue.submit([CE.finish()])
    
        }
    
        async function draw() {
    
            const CE = device.createCommandEncoder()
            const  P = CE.beginRenderPass({
                colorAttachments: [
                    {
                        view: CANVAS.ctx.getCurrentTexture().createView(),
                        clearValue: {r: 1., g: 0., b: 0., a: 1.},
                        loadOp: "clear", 
                        storeOp: "store"
                    }
                ]
            })
            
            P.setPipeline(DRAW_PIPELINE)
            P.setBindGroup(0, DRAW_BG)
            P.draw(6)
            P.end()
    
            device.queue.submit([CE.finish()])
    
            return
        }
    
        // for debug
        function rotateView() {
            rot = camera.beta;
            dist = camera.radius;
            position = [
                // вращение вокруг оси Z
                //lookAt[0] + Math.cos(rot) * dist,
                //lookAt[1] + Math.sin(rot) * dist,
                //lookAt[2]


                // вращение вокруг оси Y
                //lookAt[0] + Math.sin(rot) * dist,
                //lookAt[1],
                //lookAt[2] + Math.cos(rot) * dist

                // работает
                // вращение arc orbit (alpha = phi), (Q = beta)
                lookAt[0] + camera.radius * Math.sin(camera.beta) * Math.cos(camera.alpha),
                lookAt[1] + camera.radius * Math.sin(camera.beta) * Math.sin(camera.alpha),
                lookAt[2] + camera.radius * Math.cos(camera.beta)
            ]
        }

    function initCanvas(device, canvas) {
        let ctx = canvas.getContext("webgpu")
    
        let presentationFormat = navigator.gpu.getPreferredCanvasFormat()
        ctx.configure({device, format: presentationFormat})
    
        const w = Math.ceil(canvas.clientWidth  * 1.5) 
        const h = Math.ceil(canvas.clientHeight * 1.5) 
    
        canvas.width  = w
        canvas.height = h
    
        return {
            ctx, presentationFormat, w, h
        }
    }

    function SRC() {
        let CS = /* wgsl */ `

            //const RAY_DEPTH_MAX = 3;

            @group(0) @binding(0) var tout : texture_storage_2d<rgba32float, write>;

            struct BVHNode {
                aabb_l_min : vec3f,
                l_child :   i32,
                aabb_l_max : vec3f,
                    f_1 :   i32,
                aabb_r_min : vec3f,
                r_child :   i32,
                aabb_r_max : vec3f,
                    f_2 :   i32
            };

            struct Triangle {
                v0 : vec3f,
                v1 : vec3f,
                v2 : vec3f
            };

            @group(1) @binding(0) var<storage, read_write> bvh : array<BVHNode >;
            @group(1) @binding(1) var<storage, read_write> tri : array<Triangle>;

            struct Uniforms {
                pos : vec3f, // align offset 16
                rst :   f32,
                lat : vec3f, // align offset 16
                temp : f32, //u32, // rayDepth

                color : vec4f, // align offset 16
                width : f32, //u32,
                height : f32, //u32,
                uULen : f32,
                uVLen : f32,
                uCameraMatrix : mat4x4f, // align offset 16

                ray_depth : f32, //u32
                shadow_depth : f32, //u32
                temp1 : f32,
                temp2 : f32,
                light_pos : vec3f,
                temp3 : f32,
                light_color : vec3f,
                temp4 : f32
            };

            @group(2) @binding(0) var<uniform> uniforms : Uniforms;
            
            const Pi      = 3.14159265358979323846;
            const InvPi   = 0.31830988618379067154;
            const Inv2Pi  = 0.15915494309189533577;
            const Inv4Pi  = 0.07957747154594766788;
            const PiOver2 = 1.57079632679489661923;
            const PiOver4 = 0.78539816339744830961;
            const Sqrt2   = 1.41421356237309504880;
            
            const sw_f : vec2f = vec2f(${CANVAS.w}., ${CANVAS.h}.);
            const sw_u : vec2u = vec2u(${CANVAS.w}u, ${CANVAS.h}u);

            const sw_rcp_f : vec2f = 1.0/sw_f;

            const     fov :   f32 = 60.f;
            const  sinfov :   f32 = sin(.5 * fov * Pi / 180.f);
            const  aspect :   f32 = ${CANVAS.w / CANVAS.h}f;
        
            const  eps    : f32 = .0001;
            const  TMIN   : f32 = .001;
        
            const mbounce : f32 = 5.;
        
            struct RayHit {
                norm : vec3f,
                dist :   f32
                //intersected_flag : bool
            };

            var<private> stack : array<i32, 32>;

            fn intersect_bvh(o_in : vec3f, d_in : vec3f, any_hit : bool, dist_less_then : f32) -> RayHit {

                let o : vec3f = o_in;
                var d : vec3f = d_in;

                // (lazy) fix for divide by zero errors - change later
                d += vec3f(abs(d) < vec3f(.00001)) * vec3f(.00001);

                let inv_dir : vec3f = 1. / d;
            
                var dist : f32   = 1e30f;
                var norm : vec3f = vec3f(0.f);

                var stack_ptr : i32 = 0;
                var  node_idx : i32 = 0;

                while (stack_ptr >= 0) {
                    // we are testing against a leaf node
                    if (node_idx < 0) {
                        var tr : Triangle = tri[-(node_idx + 1)];

                        var n_dis : vec4f = tri_intersect(o, d, tr);

                        if (n_dis.w > 0.f && n_dis.w < dist) {
                            norm = n_dis.xyz;
                            //dist = min(n_dis.w, dist);
                            dist = n_dis.w;

                            if (any_hit && dist < dist_less_then) {
                                break;
                            }
                        }

                        stack_ptr -= 1;
                        node_idx = stack[stack_ptr];
                    } else {
                        var node : BVHNode = bvh[node_idx];

                        var l_dist : f32 = aabb_intersect(
                            node.aabb_l_min, 
                            node.aabb_l_max,
                            o, d, inv_dir
                        );

                        var r_dist : f32 = aabb_intersect(
                            node.aabb_r_min,
                            node.aabb_r_max,
                            o, d, inv_dir
                        );

                        var l_valid : bool = l_dist != -1e30f && l_dist < dist;
                        var r_valid : bool = r_dist != -1e30f && r_dist < dist;

                        if (l_valid && r_valid) {
                            var f_idx : i32;
                            var c_idx : i32;

                            if (l_dist < r_dist) {
                                c_idx = node.l_child;
                                f_idx = node.r_child;
                            } else {
                                c_idx = node.r_child;
                                f_idx = node.l_child;
                            }

                            stack[stack_ptr] = f_idx;
                            stack_ptr += 1;
                            node_idx = c_idx;
                        } else
                        if (l_valid) {
                            node_idx = node.l_child;
                        } else 
                        if (r_valid) {
                            node_idx = node.r_child;
                        } else {
                            stack_ptr -= 1;
                            node_idx = stack[stack_ptr];
                        }
                    }
                }

                var returned : RayHit;

                returned.dist = dist;

                if (dot(d, -norm) > 0.) {
                    returned.norm =  norm;
                } else {
                    returned.norm =  -norm;
                }

                if (returned.dist == 1e30f) {
                    returned.dist = -1.f;
                }

                return returned;
            }

            // from: https://www.scratchapixel.com/lessons/3d-basic-rendering/ray-tracing-rendering-a-triangle/moller-trumbore-ray-triangle-intersection.html
            fn tri_intersect(o : vec3f, d : vec3f, tri : Triangle) -> vec4f {
                var v0v1 : vec3f = tri.v1 - tri.v0;
                var v0v2 : vec3f = tri.v2 - tri.v0;
                var pvec : vec3f = cross(d, v0v2);

                var  det : f32 = dot(v0v1, pvec);

                if (abs(det) < 1e-10) {
                    return vec4f(-1.f);
                }

                var i_det : f32   = 1.f / det;

                var  tvec : vec3f = o - tri.v0;

                var u : f32 = dot(tvec, pvec) * i_det;
                
                if (u < 0.f || u > 1.f) {
                    return vec4f(-1.f);
                }

                var qvec : vec3f = cross(tvec, v0v1);

                var v : f32 = dot(d, qvec) * i_det;
                if (v < 0.f || u + v > 1.f) {
                    return vec4f(-1.f);
                }

                return vec4f(
                    normalize(cross(v0v1, v0v2)),
                    dot(v0v2, qvec) * i_det
                );
            }

            fn aabb_intersect(low : vec3f, high : vec3f, o : vec3f, d : vec3f, iDir : vec3f) -> f32 {
                //var iDir = 1. / d;
                var f = (high - o) * iDir; var n = (low - o) * iDir;
                var tmax = max(f, n); var tmin = min(f, n);
                var t0 = max(tmin.x, max(tmin.y, tmin.z));
                var t1 = min(tmax.x, min(tmax.y, tmax.z));
                return select(-1e30, select(t0, -1e30, t1 < 0.), t1 >= t0);
            }

            @compute @workgroup_size(8, 8, 1)
            fn main(@builtin(global_invocation_id) global_id : vec3u) {
                if (any(global_id.xy >= sw_u)) {return;}
                let coord : vec2i = vec2i(global_id.xy);

                var t : vec4f;

                ptStep(coord, &t);

                textureStore(tout, coord, t);
            }

            // debug
            fn intersect_tri_brute_force(o : vec3f, d : vec3f, tri : Triangle) -> vec4f {

                let e1 : vec3f = tri.v1 - tri.v0;
                let e2 : vec3f = tri.v2 - tri.v0;
                let P : vec3f = cross(d, e2);
                let det : f32 = dot(e1, P);

                // Not culling back-facing triangles
                if (det > -eps && det < eps) {
                    return vec4f(-1.f);
                }

                let invDet : f32 = 1.0f / det;
                let T : vec3<f32> = o - tri.v0;
                let u : f32 = dot(T, P) * invDet;

                if (u < 0.0f || u > 1.0f) {
                    return vec4f(-1.f);
                }

                let Q : vec3<f32> = cross(T, e1);
                let v : f32 = dot(d, Q) * invDet;

                if (v < 0.0f || u + v > 1.0f) {
                    return vec4f(-1.f);
                }

                let t0 : f32 = dot(e2, Q) * invDet;
                return vec4f( normalize(cross(e1, e2)), t0 );
            }

            // for test (debug)
            fn intersect_brute_force(o_in : vec3f, d_in : vec3f) -> RayHit {

                var res : RayHit;
                res.norm = vec3f(-1.f);
                res.dist = 1e30f;

                let num_triangles : u32 = arrayLength(&tri); //100; //156; //

                // меньше 12 ти какая то плоскость в данных глючит (нижняя), floor ебучий добавлялся (пол)
	            for (var i : u32 = 0; i<num_triangles; i++) {

                    //var temp : vec4f = intersect_tri_brute_force( o_in, d_in, tri[i] );
                    var temp : vec4f = tri_intersect( o_in, d_in, tri[i] );
                    if (temp.w > eps && temp.w < res.dist) {
                        res.norm = temp.xyz;
                        res.dist = temp.w;
                    }
                }

                return res;
            }

            
            fn RaySphereIntersection(ray_ori : vec3f, ray_dir : vec3f, sphere_center : vec3f, sphere_radius : f32) -> f32 {
            
                var t : f32;

                let sr : vec3f = ray_ori - sphere_center;
                let b : f32 =  dot(sr,ray_dir);
                let c : f32 = dot(sr,sr) - (sphere_radius*sphere_radius);
                let d : f32 = b*b - c;

                if (d > 0) 
                {
                    let e : f32 = sqrt(d);
                    let t0 : f32 = -b-e;
                    if(t0 < 0) {
                        t = -b+e;
                    } else {
                        t = min(-b-e,-b+e);
                    }
                    return t; //return 1;
                }

                return -1.0; //return 0;
            }

            fn ptStep(coord : vec2i, tout : ptr<function, vec4f>) {
                var o : vec3f;
                var d : vec3f;

                getCameraRay3(vec2f(coord), &o, &d);

                let light_pos : vec3f = uniforms.light_pos; //vec3f( -23, 3, 25 ) ; 
                let light_color : vec3f = uniforms.light_color; // vec3f( 0.7, 0.7, 0.7 ); // vec3f( 1, 1, 1 ); // 
                let light_sphere_radius : f32 = 2.0;

                var hit_r_color : vec3f = vec3f( 0, 0, 0 );
                let pf : vec2f = vec2f(coord) * sw_rcp_f; // {xf, yf}

                var ray_depth : u32;

                var shadow_coef : f32 = 1.0f;

                let ray_depth_max : u32 = u32(uniforms.ray_depth); // + 1;
                let shadow_depth_max : u32 = u32(uniforms.shadow_depth); // + 1;

                for (ray_depth = 1; ray_depth <= ray_depth_max; ray_depth++) { // 1

                    var res : RayHit = intersect_bvh(o, d, false, 0);
                    //var res : RayHit = intersect_brute_force(o, d);

                    let dist_to_sphere_light = RaySphereIntersection(o, d, light_pos, 2.0);
                    if (dist_to_sphere_light > TMIN && (res.dist < TMIN || dist_to_sphere_light < res.dist)) {
                        hit_r_color += light_color * shadow_coef;
                        break;
                    }

                    if ( res.dist > TMIN ) {

                        // calculate simple diffuse light
                        let hitpoint : vec3f = o + d * (res.dist - TMIN);
                        var L : vec3f = light_pos - hitpoint;
                        let dist_to_light : f32 = length(L);
                        
                        L = normalize(L);
                        var diffuse_light : f32 = max( dot(L, res.norm), 0.0);
                        diffuse_light = min( diffuse_light, 1.0);

                        //calculate simple specular light
                        let H : vec3f = normalize(L + (-d));
                        var specular_light : f32 = pow(max(dot(H, res.norm),0.0), 25.0);

                        diffuse_light  *=  16.0f / dist_to_light;
                        specular_light *=  16.0f / dist_to_light;

                        diffuse_light = clamp(diffuse_light, 0.0, 1.0);
                        specular_light = clamp(specular_light, 0.0, 1.0);

                        let rez_color : vec3f = light_color * diffuse_light +  (vec3f(1.0, 1.0, 1.0)) * specular_light*0.2 + (vec3f(0.2, 0.2, 0.2));

                        // shadow
                        if ( ray_depth <= shadow_depth_max ) { 
                            var res_shadow : RayHit = intersect_bvh(hitpoint, L, true, dist_to_light);
                            if ( res_shadow.dist > eps && res_shadow.dist < dist_to_light) {
                                shadow_coef *= 0.33f; //0.25f;
                            }
                        }

                        hit_r_color += rez_color * shadow_coef; // + vec3f(0.2,0.2,0.2); // + vec3f(0.1,0.1,0.1);

                        { // reflect
                            d = reflect(d, res.norm); // normalize()
                            o = hitpoint + d * TMIN; // eps; // EPSILON 
                        }

                    } else {
                        //*tout = vec4f(0.5, 0.5, 0.5, 1.);
                        hit_r_color += vec3f(0.5f, 0.5f, pf.y + 0.3f) * shadow_coef; // * 0.85f; //* shadow_coef;

                        break;
                    }
                }

                hit_r_color /= f32(ray_depth); // f32(max(ray_depth, 1)); // pow(f32(ray_depth), 0.9f); // normalize the colors
                hit_r_color = clamp(hit_r_color, vec3f(0.0f), vec3f(1.0f));
                *tout = vec4f(hit_r_color, 1.0);
            }

            fn getCameraRay3(coord : vec2f, o : ptr<function, vec3f>, d : ptr<function, vec3f>) {

                let a : vec3f = uniforms.uCameraMatrix[0].xyz;
                let b : vec3f = uniforms.uCameraMatrix[1].xyz; 
                let c : vec3f = uniforms.uCameraMatrix[2].xyz; 
                let cameraPosition  : vec3f = uniforms.uCameraMatrix[3].xyz; 

                let pf : vec2f = (coord + 0.5) * sw_rcp_f;

                let t1 : vec3f = c + (a * pf.x);
                let t2 : vec3f = b * pf.y;
                let image_pos : vec3f = t1 + t2;

                *o = image_pos; // или cameraPosition, нет разнцы ? 
                *d = normalize( image_pos - cameraPosition );
            }

            fn getCameraRay2(coord : vec2f, o : ptr<function, vec3f>, d : ptr<function, vec3f>) {

                var camRight        : vec3f = uniforms.uCameraMatrix[0].xyz;
                var camUp           : vec3f = uniforms.uCameraMatrix[1].xyz;
                var camForward      : vec3f = uniforms.uCameraMatrix[2].xyz;
                let cameraPosition  : vec3f = uniforms.uCameraMatrix[3].xyz;

                
                let fragCoord : vec2f = coord + 0.5;
                
                //let uResolution : vec2f = vec2f(f32(uniforms.width), f32(uniforms.height));
                let uResolution : vec2f = vec2f(uniforms.width, uniforms.height);

                // we must map pixelPos into the range -1.0 to +1.0
                var pixelPos : vec2f = (fragCoord / uResolution) * 2.0 - 1.0;

                //let rayDir : vec3f = normalize( pixelPos.x * camRight * uniforms.uULen + pixelPos.y * camUp * uniforms.uVLen + camForward );
                let rayDir : vec3f = normalize( pixelPos.x * camRight + pixelPos.y * camUp + camForward );

                *o = cameraPosition; // image_pos нужен или нет разнцы ? 
                *d = rayDir; 
            }

            // переписать ? 
            fn getCameraRay(coord : vec2f, o : ptr<function, vec3f>, d : ptr<function, vec3f>) {
                var sspace : vec2f = coord / sw_f; sspace = sspace * 2. - vec2f(1.); sspace.y *= -1.;
                var local  : vec3f = vec3f(
                    aspect * sspace.x * sinfov,
                    1.,
                    sspace.y * sinfov
                );

                var forward : vec3f = normalize(vec3f(uniforms.lat - uniforms.pos));
                var   right : vec3f = normalize(vec3f(forward.y, -forward.x, 0.));
                var      up : vec3f = cross(right, forward);

                //*o = cameraPosition;
                *o = uniforms.pos;
                *d = toWorld(right, forward, up, normalize(local));
            }

            fn toWorld(v_x : vec3f, v_y : vec3f, v_z : vec3f, w : vec3f) -> vec3f {
                return v_x * w.x + v_y * w.y + v_z * w.z;
            }
        `;

        let VS = /* wgsl */ `
            @vertex
            fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {

                let positions = array<vec2f, 6>(
                    vec2f( 1.0,  1.0),
                    vec2f( 1.0, -1.0),
                    vec2f(-1.0, -1.0),
                    vec2f( 1.0,  1.0),
                    vec2f(-1.0, -1.0),
                    vec2f(-1.0,  1.0),
                );

                let pos: vec2f = positions[vertexIndex];
                return vec4f(pos, 0.0, 1.0);
            }
        `;

        let FS = /* wgsl */ `
            @group(0) @binding(0) var image : texture_2d<f32>;

            @fragment
            fn fs(@builtin(position) fragCoord : vec4f) -> @location(0) vec4f {
                var raw : vec4f = textureLoad(image, vec2i(fragCoord.xy), 0);
                return raw;
                //return vec4f(0.5, 0.5, 0.5, 1.0);
            }
        `;

        return { CS, VS, FS }
    }
}
