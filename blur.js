class Blur{

    constructor(ctx, radius){
        this.ctx = ctx;
        this.radius = radius ? Math.abs(radius) : 1
        this.threads = 2;
        this.uselinear = false;
        this.usemainthread = false;
        this.stoped = false;
        this.running = false;
        this.debug = false;
    }

    setRadius(radius){
        this.radius = typeof radius == "number" ? Math.abs(radius) : 1
    }

    setThreads(threads){
        this.threads = typeof threads == "number" ? threads : 2;
    }

    useMainThread(value){
        this.usemainthread = typeof value == "boolean" ? value : false;
    }

    useLinear(value){
        this.uselinear = typeof value == "boolean" ? value : false;
    }

    setDebug(value){
        this.debug = typeof value == "boolean" ? value : false;
    }

    stop(){
        if(this.running) this.stoped = true;
    }
}

(function(){
    // Something functions

    //Get's average number for array
    // => [5, 5, 4, 4] => 18 / 4 => 4.5
    var average = (array) => array.reduce((a, b) => a + b) / array.length;

    /**
     * Returns the average value of a pixel over 
     * a specified radius in specific x and y
     * 
     * @param {ImageData} data 
     * @param {Number} radius 
     * @param {Number} x 
     * @param {Number} y 
     */
    function getAverage(data, radius, x, y){
        // Calc the center
        var center = Math.round(radius * 0.5),
            // If the center goes beyond the boundaries of the image, we normalize it.
            sx = x - center > 0 ? x - center : 0,
            sy = y - center > 0 ? y - center : 0,
            // Do the same with the width
            ex = x + center < data.width ? x + center : data.width,
            ey = y + center < data.height ? y + center : data.height,
            // Reserve variables
            pos = null,
            dx, dy,
            delta = [
                [],
                [],
                [],
                []
            ];
            
        // We go to the specified points in the image and collect pixel data on a four channels
        for(dx = sx;dx < ex;dx++)
            for(dy = sy;dy < ey;dy++){
                pos = 4 * (dx + dy * data.width);
                delta[0].push(data.data[pos]);
                delta[1].push(data.data[pos+1]);
                delta[2].push(data.data[pos+2]);
                delta[3].push(data.data[pos+3]);
            }
        
        // We return the average value of four channels
        return [
            average(delta[0]),
            average(delta[1]),
            average(delta[2]),
            average(delta[3])
        ]
    }

    /**
     * Splits an image of height H and width
     * W into pieces of height h and width w
     * 
     * @param {Number} W 
     * @param {Number} H 
     * @param {Number} w 
     * @param {Number} h 
     */
    function blocks(W, H, w, h) {
        var chuncks = [],
            cx = W / w | 0,
            cy = H / h | 0,
            x, y;
        
        for(x = 0; x < cx; x++){
            chuncks[x] = [];
            for(y = 0; y < cy; y++){
                chuncks[x][y] = {
                    w: w,
                    h: h
                }

                if(y + 1 >= cy && (y * h < H || y * h > H)){
                    chuncks[x][y].h += H - (y + cy - y) * h;
                }
                if(x + 1 >= cx && (x * w < W || x * w > W)){
                    chuncks[x][y].w += W - (x + cx - x) * w;
                }
            }
        }

        return {
            stepx: w,
            stepy: h,
            chuncks: chuncks
        };
    }

    /**
     * If image data has been transferred,
     * inserts ndata into data
     * 
     * @param {ImageData} data 
     * @param {ImageData} ndata 
     * @param {Number} dx 
     * @param {Number} dy 
     */
    function put(data, ndata, dx, dy){
        var y,
            x,
            w = ndata.width, 
            h = ndata.height,
            pos,
            mx,
            my,
        mpos;

        for (y = 0; y < h; y++)
            for (x = 0; x < w; x++) {
                mx = x + dx;
                my = y + dy;
                pos = 4 * (y * w + x);
                mpos = 4 * (my * data.width + mx);

                data.data[mpos] = ndata.data[pos]
                data.data[mpos+1] = ndata.data[pos+1]
                data.data[mpos+2] = ndata.data[pos+2]
                data.data[mpos+3] = ndata.data[pos+3]
            }
    }

    /**
     * Crop image
     * 
     * @param {ImageData} data 
     * @param {Number} dx 
     * @param {Number} dy 
     * @param {Number} w 
     * @param {Number} h 
     */
    function cut(data, dx, dy, w, h){
        var new_data = new ImageData(w, h),
                                        y,
                                        x,
                                lb = dy + h,
                                lr = dx + w,
                                        pos,
                                        mx,
                                        my,
                                    mpos;

        for (y = dy; y < lb; y++)
            for (x = dx; x < lr; x++) {
                mx = x - dx;
                my = y - dy;
                pos = 4 * (y * data.width + x);
                mpos = 4 * (my * w + mx);

                new_data.data[mpos] = data.data[pos]
                new_data.data[mpos+1] = data.data[pos+1]
                new_data.data[mpos+2] = data.data[pos+2]
                new_data.data[mpos+3] = data.data[pos+3]
            }
        
        return new_data;
    }


    //Worker's code
    const blob = new Blob([`
        ${cut.toString()}
        var average = ${average.toString()}
        ${getAverage.toString()}

        self.onmessage = function(e) {
            var radius = e.data.radius, // Blur radius
                metrix = e.data.metrix, // x, y, width, height
                cx = metrix.x - radius > 0 ? metrix.x - radius : 0, // X offset
                cy = metrix.y - radius > 0 ? metrix.y - radius : 0, // Y offset
                dx = (metrix.x - cx), // real X offset
                dy = (metrix.y - cy), // real y offset
                cw = metrix.width + dx < e.data.context.width ? metrix.width + dx : e.data.context.width, // width with dx offset
                ch = metrix.height + dy < e.data.context.height ? metrix.height + dy : e.data.context.height, // height with dy offset
                pos, data, x, y; // use next

            //Blur borders for linear drawing
            if(e.data.cutradius == true){
                data = cut(e.data.context, cx, cy, cw, ch);

                for(x = 0;x < data.width;x++){
                    for(y = 0;y < data.height;y++){
                        pos = 4 * (x + y * data.width);
                        avg = getAverage(data, radius, x, y);
                        data.data[pos] = avg[0];
                        data.data[pos+1] = avg[1];
                        data.data[pos+2] = avg[2];
                        data.data[pos+3] = avg[3];
                    }
                    
                    if(e.data.progressevents)
                        self.postMessage({
                            type: "progress",
                            done: x + y,
                            of: data.width + data.height
                        })
                }

                data = cut(data, dx, dy, metrix.width, metrix.height);
            //Blur region
            }else{
                data = cut(e.data.context, metrix.x, metrix.y, metrix.width, metrix.height)
                
                for(x = 0;x < data.width;x++){
                    for(y = 0;y < data.height;y++){
                        pos = 4 * (x + y * data.width);
                        avg = getAverage(data, radius, x, y);
                        data.data[pos] = avg[0];
                        data.data[pos+1] = avg[1];
                        data.data[pos+2] = avg[2];
                        data.data[pos+3] = avg[3];
                    }

                    if(e.data.progressevents)
                        self.postMessage({
                            type: "progress",
                            done: x + y,
                            of: data.width + data.height
                        })
                }
            }

            
            
            self.postMessage({
                type: "end",
                d: data,
                m: metrix
            })
        };
    `], {type: 'application/javascript'});


    // Like a stream
    class SThread{
        constructor(){
            var _ = this;
            _.worker = new Worker(URL.createObjectURL(blob));

        }

        start(context, radius, width, height, x, y, cutradius, ondata){
            var _ = this;
            _.worker.postMessage({
                context: context,
                radius: radius,
                cutradius: cutradius,
                progressevents: typeof ondata == "function",
                metrix: {
                    width: width,
                    height: height,
                    x: x,
                    y: y
                }
            })

            return new Promise(function(res, rej){
                _.worker.onmessage = function(e){
                    if(e.data.type == "end"){
                        res(e.data)
                        _.worker.terminate()
                    }else if(e.data.type == "progress"){
                        if(typeof ondata == "function")
                            ondata(e.data);
                    }
                }
            })
        }
    }

    /**
     * Creates a stream and processes a piece of image asynchronously
     * 
     * @param {Int} x 
     * @param {Int} y 
     * @param {Int} w 
     * @param {Int} h 
     * @param {Int} r 
     * @param {ImageData} imagedata 
     * @param {Int} index 
     * @param {Int} of 
     * @param {Boolean} cutradius 
     */
    async function decASYNC(x, y, w, h, r, imagedata, index, of, cutradius, ondata){
        thread = new SThread();

        return new Promise(function(res, rej){
            thread.start(imagedata, r, w, h, x, y, cutradius == true, ondata).then(function(data){
                data.iterate = {
                    number: index,
                    of: of - 1
                }
                res(data)
            })
        })
    }


    /**
     * Blurs a piece of the image given by the borders x y and the frame w h
     * 
     * @param {Int} x
     * @param {Int} y
     * @param {Int} w
     * @param {Int} h
     * @param {ImageData} imagedata 
     */
    Blur.prototype.blurRegion = function(x, y, w, h, imagedata){
        var avg = null,
            _ = this,
            pos,
            rt = {
                data: function(func){
                    rt.ondata = func;

                    if(!window.Worker || _.usemainthread){
                        rt.render()
                    }

                    return rt;
                },
                render: function(func){
                    rt.onrender = func;

                    if(!window.Worker || _.usemainthread){
                        rt.onrender()
                    }
                    return rt;
                }
            },
            threads = _.threads,
            data = imagedata ? cut(imagedata, x, y, w, h) : _.ctx.getImageData(x, y, w, h);

        if(window.Worker && !_.usemainthread && threads > 1){
            if((threads % 2) != 0)
                threads += 1

            var tc = Math.round(threads / 2),
                bl = blocks(data.width, data.height, Math.floor(data.width / tc), Math.floor(data.height / tc));

            if(!_.uselinear){
                _.running = true;
                var x, y;
                for(x = 0;x < bl.chuncks.length;x++){
                    for(y = 0;y < bl.chuncks[x].length;y++){

                        if(_.debug){
                            _.ctx.fillStyle = "rgba(0, 155, 0, 0.4)";
                            _.ctx.fillRect(x * bl.stepx, y * bl.stepy, bl.chuncks[x][y].w, bl.chuncks[x][y].h);
                        }

                        decASYNC(
                            x * bl.stepx,
                            y * bl.stepy,
                            bl.chuncks[x][y].w,
                            bl.chuncks[x][y].h,
                            _.radius,
                            data,
                            x + y,
                            bl.chuncks.length + bl.chuncks[y].length,
                            false,
                            rt.ondata
                        ).then(function(Vdata){
                            if(!imagedata){
                                _.ctx.putImageData(Vdata.d, Vdata.m.x, Vdata.m.y);
                            }else{
                                put(data, Vdata.d, Vdata.m.x, Vdata.m.y);
                            }

                            if(typeof rt.render == "function")
                                rt.onrender(Vdata);
                        })
                    }
                }
            }else{
                try{
                  _.running = true;
                  var renderMatrix = [];
  
                  (function(){
                      for(var i = 0, len = tc;i < len;i++){
                          renderMatrix.push(new Uint8Array(tc).fill(0));
                      }
                  })()

                  function next(){
                        var x, y;
                        for(x = 0;x < renderMatrix.length;x++){
                            for(y = 0;y < renderMatrix[x].length;y++){
                                if(renderMatrix[x][y] == 1) break;

                                if(renderMatrix[x-1] == undefined && renderMatrix[x][y] == 0){
                                    renderMatrix[x][y] = 1;
                                    break;
                                }else if(renderMatrix[x][y] == 0 && renderMatrix[x-1][y] == 3 && (renderMatrix[x][y - 1] == 3 || renderMatrix[x][y - 1] == undefined)){
                                    renderMatrix[x][y] = 1;
                                    break;
                                }
                            }
                        }
                  }
  
                  function render(bl, sx, sy, tx, ty, index, done){
                      renderMatrix[tx][ty] = 2;
                        if(_.debug){
                            _.ctx.fillStyle = "rgba(0, 155, 0, 0.4)";
                            _.ctx.fillRect(tx * sx, ty * sy, bl.w, bl. h);
                        }

                        decASYNC(
                            tx * sx,
                            ty * sy,
                            bl.w,
                            bl.h,
                            _.radius,
                            data,
                            index,
                            tc * tc,
                            true,
                            rt.ondata
                        ).then(function(Vdata){
                            if(!imagedata){
                                put(data, Vdata.d, Vdata.m.x, Vdata.m.y);
                                _.ctx.putImageData(data, 0, 0);
                            }else{
                                put(data, Vdata.d, Vdata.m.x, Vdata.m.y);
                            }

                            renderMatrix[tx][ty] = 3;

                            if(typeof rt.render == "function")
                                rt.onrender(Vdata);

                            if(renderMatrix[tc-1][tc-1] != 0)
                                _.running = false;
                            

                            if(!_.stoped)
                                done();
                        })
                  }
                  
                  function rd(){
                      if(_.stoped){
                        _.stoped = false;
                        _.running = false;
                        return;
                      }

                      next();

                      for(var x = 0;x < renderMatrix.length;x++){
                          for(var y = 0;y < renderMatrix[x].length;y++){
                              if(renderMatrix[x][y] == 1){
                                  render(bl.chuncks[x][y], bl.stepx, bl.stepy, x, y, x + y, function(){
                                      requestAnimationFrame(rd);
                                  })
                              }
                          }
                      }
                  }
                  rd();
                }catch{
                    _.running = false;
                }
              }

            return rt;
        }else if(window.Worker && !_.usemainthread && threads <= 1){
            try{
                _.running = true;
                decASYNC(0, 0, data.width, data.height, _.radius, data, 1, 1).then(function(data){
                    _.ctx.putImageData(data.d, x, y);
                    _.running = false;
                })
            }catch{
                _.running = false;
            }
            return;
        }
        
        for(var cx = 0;cx < w;cx++)
            for(var cy = 0;cy < h;cy++){
                pos = 4 * (cx + cy * w);
                avg = getAverage(data, _.radius, cx, cy);
                data.data[pos] = avg[0];
                data.data[pos+1] = avg[1];
                data.data[pos+2] = avg[2];
                data.data[pos+3] = avg[3];
            }

        _.ctx.putImageData(data, x, y)

        return rt;
    }

    Blur.prototype.blur = function(imagedata){
        return this.blurRegion(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
})()