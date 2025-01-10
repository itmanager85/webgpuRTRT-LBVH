let bvhTree = null;

let raytrace_depth = 3;
let shadow_depth = 2; // 3

let point_light = new PointLight();

let loaded_scene_index = -1;

let scene = null;

window.onload = async () => {
    const { adapter, device } = await initWebGPU()
    if (!adapter || !device) return

    setBuildTime()
    setParseTime()
    setTriangles()

    bvhTree = new BVHTree(device);

    let PT = null

    let auto_rotate_flag = false; 
    let animate_scene_flag = false; 
    let rebuild_LBVH_flag = false; 

    let lastCalledTime;
    let count_sum = 0;

    delta_sum = 0.0;
    FPS_sum = 0.0;

    async function frame() {
        if (PT) {

            if (auto_rotate_flag) {
                PT.camera.add_rotate(0.7 * Math.PI / 180, 0.0); 
            }

            if (point_light.flag_animate) {
                point_light.animate();
            }

            if (animate_scene_flag && 1 == loaded_scene_index) {

                if (!scene) {
                    scene = new Scene ();
                    const NUM_NEW_CUBES = 9; 
                    let new_tris = new Float32Array( bvhTree.TRI_ARRAY.slice(156 * (48/4), (156 + NUM_NEW_CUBES*6*2) * (48/4)) );
                    scene.load_cubes(new_tris);

                    scene.random_cubes_phi_delta ();
                }

                scene.update_rotation();

                for (let i = 0; i<scene.cubes.length; i++) {
                    bvhTree.update_triangles_in_gpu_buffer(156 + (i* 6*2), scene.cubes[i].faces_animate, 6*2);
                }

                let bounds_default = bvhTree.BOUNDS;
                let bounds = scene.get_bounds();

                let NEW_BOUNDS = {
                    min: [Math.min(bounds_default.min[0], bounds.min[0]), Math.min(bounds_default.min[1], bounds.min[1]), Math.min(bounds_default.min[2], bounds.min[2])],
                    max: [Math.max(bounds_default.max[0], bounds.max[0]), Math.max(bounds_default.max[1], bounds.max[1]), Math.max(bounds_default.max[2], bounds.max[2])]
                } 

                bvhTree.update_bounds(NEW_BOUNDS); // TO DO: do it in CS (real time)
            }

            if (rebuild_LBVH_flag) {
                await bvhTree.rebuild();
            }

            await PT.sample(raytrace_depth, shadow_depth, point_light.get_position(), point_light.color);
            
            await PT.draw()

            if(!lastCalledTime) {
                lastCalledTime = performance.now();
                delta_sum = 0.0
                FPS_sum = 0.0
                count_sum = 0;
             } else {

                let now = performance.now();
                let delta = (now - lastCalledTime);
                lastCalledTime = now;
                let fps = 1000.0 / delta;

                delta_sum += delta;
                FPS_sum += fps;
                count_sum += 1;

                if ( delta_sum >= 500 ) {

                    let avg_delta = delta_sum / count_sum;
                    let fps = Math.round( 1000.0 / avg_delta );
                    document.querySelector("#RTRT-fps").textContent = fps.toString() + " FPS";

                    delta_sum = 0.0
                    FPS_sum = 0.0
                    count_sum = 0;
                }
            }
        }

        window.requestAnimationFrame(frame)
    }

    frame()

    document.querySelector("#canvas").addEventListener("mousemove", (event) => {

        if (1 == event.which) {
            if (PT) {
                PT.camera.add_rotate(event.movementX * 0.01, event.movementY * 0.01); 
            }
        }
    })

    document.querySelector("#canvas").addEventListener("mousewheel", (event) => {
            if (PT) {
                PT.camera.add_radius(-event.wheelDelta * PT.camera.delta);
            }
    })

    function setTriangles(count) {
        let str = ""
        if (count == null) {
            str = "----------"
        } else {
            str = count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        }
        document.querySelector("#triangle-count").textContent = str
    }

    function setParseTime(time) {
        let str = ""
        if (time == null) {
            str = "----------"
        } else {
            str = time.toString().slice(0, Math.max(time.toString().length, 9)) + "s"
        }
        document.querySelector("#parse-time").textContent = str
    }

    function setBuildTime(time) {

        setBuildTimeFn(time, "#build-time");

        //let str = ""
        //if (time == null) {
        //    str = "----------"
        //} else {
        //    str = time.toString().slice(0, Math.max(time.toString().length, 9)) + "s"
        //}
        //document.querySelector("#build-time").textContent = str
    }

    {
        async function readFiles(contents, flag_load_drop = false) {
           // setBuildTime()
            setParseTime()
            setTriangles()
            let s, e
            s = Date.now()
            const { NUM_TRIS, TRI_ARR, BOUNDS } = parseObj(contents[0])

            if (NUM_TRIS > 2_100_000) {
                alert("Warning: Model is too large. Try < 2,000,000 triangles.")
                return
            }

            e = Date.now()
            setParseTime((e - s) / 1000.)
            setTriangles(NUM_TRIS)

            // make thread sleep to update UI
            await new Promise(r => setTimeout(r, 10))

            bvhTree.prepare_buffers(TRI_ARR, NUM_TRIS, BOUNDS) ;
            const { BVH_BUFFER, O_TRIANGLE_BUFFER } = await bvhTree.build(); 

            PT = initRayTracer(device, document.querySelector("#canvas"), {BVH_BUFFER, O_TRIANGLE_BUFFER, BOUNDS})

            if ( flag_load_drop ) {
                point_light = new PointLight();
                point_light.init();
                point_light.set_center_from_bounds( BOUNDS );
                checkbox_animate_light.checked = false;

                checkbox_animate_scene.checked = false;
                checkbox_rebuild_LBVH.checked = false;
                animate_scene_flag = rebuild_LBVH_flag = false;

                number_raytrace_depth.value = raytrace_depth = 3;
                number_shadow_depth.value = shadow_depth = 2;

                loaded_scene_index = 0;
            } else if (3 == loaded_scene_index ) {
                point_light.set_scene_center(PT.camera.lookAt); 
            }
        }

        // Watch for browser/canvas resize events
        window.addEventListener("resize", function ()
        {
            handleWindowResize();
        });
    
        function handleWindowResize()
        {
            if ( PT ) {
                const {r, phi, theta} = {r : PT.camera.radius, phi : PT.camera.alpha, theta : PT.camera.beta};
                PT = initRayTracer(device, document.querySelector("#canvas"), {BVH_BUFFER : bvhTree.BVH_BUFFER, O_TRIANGLE_BUFFER : bvhTree.O_TRIANGLE_BUFFER, BOUNDS : bvhTree.BOUNDS})
                PT.camera.set_sperical( r, phi, theta );
            }
        }
        
        document.body.addEventListener("drop", (e) => {        
            e.preventDefault()
            e.stopPropagation()
        
            const files = []
            if (e.dataTransfer.items) {
                [...e.dataTransfer.items].forEach((item) => {
                    if (item.kind === "file") {
                        const file = item.getAsFile()
                        if (file.name.endsWith(".obj")) {
                            files.push(file)
                        }
                    }
                })
            } else {
                [...e.dataTransfer.files].forEach((file) => {
                    if (file.name.endsWith('.obj')) {
                        files.push(file)
                    }
                })
            }
        
            // Read all .obj files as text
            const reader = new FileReader()
            const contents = []
            let incr = 0
        
            reader.onload = () => {
                //console.log(reader.result)
                contents.push(reader.result)
                //console.log(contents)

                incr++
                if (incr < files.length) {
                    reader.readAsText(files[incr])
                } else {
                    //console.log(contents)
                    readFiles(contents, true)
                }
            }
        
            if (files.length > 0) {
                reader.readAsText(files[incr])
            } else {
                alert("File(s) is not valid.")
            }
        })
        
        document.body.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        
        document.body.addEventListener('dragenter', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        
        load_scene_elem1.onclick = function() {

            PT = null;

            point_light = new PointLight();
            point_light.init();

            loaded_scene_index = 1;
            load_scene_from_file("./3d_models/Stonehenge + 9 cubes.obj");

            //point_light.deactivate_animate(false);
            checkbox_animate_light.checked = false;

            checkbox_animate_scene.checked = true;
            checkbox_rebuild_LBVH.checked = true;
            animate_scene_flag = rebuild_LBVH_flag = true;

            number_raytrace_depth.value = raytrace_depth = 3;
            number_shadow_depth.value = shadow_depth = 3;
        };

        load_scene_elem2.onclick = function() {

            PT = null;

            loaded_scene_index = 2;

            point_light = new PointLight();
            let light_pos = [-23.0, 3.0, 25.0];
            point_light.init(light_pos);
            point_light.activate_animate();

            load_scene_from_file("./3d_models/Stonehenge.obj");

            checkbox_animate_light.checked = true;
            checkbox_animate_scene.checked = false;
            checkbox_rebuild_LBVH.checked = false;
            animate_scene_flag = rebuild_LBVH_flag = false;

            number_raytrace_depth.value = raytrace_depth = 3;
            number_shadow_depth.value = shadow_depth = 3;
        };

        load_scene_elem3.onclick = function() {

            PT = null;

            loaded_scene_index = 3;

            point_light = new PointLight();
            let light_pos = [-23.0 * 10, 3.0, 200.0];
            point_light.init(light_pos);
            point_light.activate_animate(); // 0.005

            load_scene_from_file("./3d_models/chess_v1.obj");

            //if (PT) {
            //    point_light.set_scene_center(PT.camera.lookAt); 
            //}

            checkbox_animate_light.checked = true;
            checkbox_animate_scene.checked = false;
            checkbox_rebuild_LBVH.checked = false;
            animate_scene_flag = rebuild_LBVH_flag = false;

            number_raytrace_depth.value = raytrace_depth = 3;
            number_shadow_depth.value = shadow_depth = 2;
        }

        function load_scene_from_file( file_name ) {
            const contents = []
            
            fetch( file_name )
                .then( response => response.text() )
                //.then( text => console.log(text) )
                .then( text => {contents.push(text); readFiles(contents)} )
        }
    }

    document.querySelector("#auto_rotate").addEventListener("change", e => {

            if (e.target.checked) {
                auto_rotate_flag = true;
            } else {
                auto_rotate_flag = false;
            }
        });

    const checkbox_animate_light = document.getElementById('animate_light');
    checkbox_animate_light.addEventListener("change", e => {
    
            if (e.target.checked) {
                if (0 == loaded_scene_index) {

                    point_light.set_center_from_bounds( bvhTree.BOUNDS, true );
                    point_light.activate_animate();

                } else if (1 == loaded_scene_index) {

                    point_light.position = [-23.0 *1.5, 3.0, 25.0];
                    point_light.activate_animate();

                } else if (2 == loaded_scene_index) {

                    point_light.position = [-23.0, 3.0, 25.0];
                    point_light.activate_animate();

                } else if (3 == loaded_scene_index) {

                    point_light.position = [-23.0 * 10, 3.0, 200.0];
                    if (PT) {
                        point_light.set_scene_center(PT.camera.lookAt); 
                    }
                    point_light.activate_animate();
                }
            } else {
                point_light.deactivate_animate();
            }
        });

    const checkbox_animate_scene = document.getElementById('animate_scene');
    checkbox_animate_scene.addEventListener("change", e => {

        if (e.target.checked) {

            if (1 == loaded_scene_index ) {
                checkbox_rebuild_LBVH.checked = true;
                animate_scene_flag = rebuild_LBVH_flag = true;
            } else {
                checkbox_animate_scene.checked = false;
                animate_scene_flag = false;
            }
        } else {
            animate_scene_flag = false;
        }
    });

    const checkbox_rebuild_LBVH = document.getElementById('rebuild_LBVH_each_frame');
    checkbox_rebuild_LBVH.addEventListener("change", e => {

        if (e.target.checked) {
            rebuild_LBVH_flag = true;
        } else {
            checkbox_animate_scene.checked = false;
            animate_scene_flag = rebuild_LBVH_flag = false;
        }
    });

    const number_raytrace_depth = document.getElementById('raytrace_depth');
    number_raytrace_depth.addEventListener('change', function() {

        raytrace_depth = this.value;

        if ( raytrace_depth < number_shadow_depth.value ) {
            number_shadow_depth.value = raytrace_depth;
            shadow_depth = raytrace_depth;
        }
    });

    const number_shadow_depth = document.getElementById('shadow_depth');
    number_shadow_depth.addEventListener('change', function() {

        if ( this.value > raytrace_depth ) {
            this.value = raytrace_depth;
        }

        shadow_depth = this.value;
    });

    load_scene_elem1.click(); // for github version
}

async function initWebGPU() {
    const adapter = await navigator.gpu?.requestAdapter()
    const device  = await adapter?.requestDevice()

    if (!device) {
        alert("browser does not support webGPU!")
        return null
    }

    return { adapter, device }
}
