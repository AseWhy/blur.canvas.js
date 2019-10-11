class blur{
    constructor(ctx, radius){
        this.ctx = ctx;
        this.radius = radius ? Math.abs(radius) : 1
        this.threads = 2;
        this.usemainthread = false;
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
}

(function(){
    let average = (array) => array.reduce((a, b) => a + b) / array.length;

    function getAverage(data, radius, x, y){
        var center = Math.round(radius * 0.5),
            sx = x - center > 0 ? x - center : 0,
            sy = y - center > 0 ? y - center : 0,
            ex = x + center < data.width ? x + center : data.width,
            ey = y + center < data.height ? y + center : data.height,
            pos = null,
            delta = [
                [],
                [],
                [],
                []
            ];
    
        for(var dx = sx;dx < ex;dx++)
            for(var dy = sy;dy < ey;dy++){
                pos = 4 * (dx + dy * data.width);
                delta[0].push(data.data[pos]);
                delta[1].push(data.data[pos+1]);
                delta[2].push(data.data[pos+2]);
                delta[3].push(data.data[pos+3]);
            }
    
        return [
            average(delta[0]),
            average(delta[1]),
            average(delta[2]),
            average(delta[3])
        ]
    }

    function blocks(W, H, w, h) {

        var hor = pack([], W, H, w, h, 0, 0);
        var ver = pack([], W, H, h, w, 0, 0);
    
        return (hor.length >= ver.length ? hor : ver).sort(function(a, b) {
            return (a.y - b.y) || (a.x - b.x);
        });
    
        function pack(pieces, W, H, w, h, x0, y0) {
            var x, y;
            var nx = W / w | 0;
            var ny = H / h | 0;
            var n = nx * ny;
            for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) {
                pieces.push({ x: x0 + x*w, y: y0 + y*h, w: w, h: h });
            }
            if (W % w >= h && H >= w) {
                pack(pieces, W % w, H, h, w, x0 + nx*w, 0);
            } else if (H % h >= w && W >= h) {
                pack(pieces, W, H % h, h, w, 0, y0 + ny*h);
            }
            return pieces;
        }
    
    }

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

        for (var y = dy; y < lb; y++)
            for (var x = dx; x < lr; x++) {
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

    var blob = new Blob([`
        ${cut.toString()}
        var average = ${average.toString()}
        ${getAverage.toString()}

        self.onmessage = function(e) {
            var radius = e.data.radius,
                metrix = e.data.metrix,
                data = cut(e.data.context, metrix.x, metrix.y, metrix.width, metrix.height),
                pos;

            for(var x = 0;x < data.width;x++)
                for(var y = 0;y < data.height;y++){
                    pos = 4 * (x + y * data.width);
                    avg = getAverage(data, radius, x, y);
                    data.data[pos] = avg[0];
                    data.data[pos+1] = avg[1];
                    data.data[pos+2] = avg[2];
                    data.data[pos+3] = avg[3];
                }
            
            self.postMessage({
                d: data,
                m: metrix
            })
        };
    `], {type: 'application/javascript'});

    class SThread{
        constructor(){
            var _ = this;
            _.worker = new Worker(URL.createObjectURL(blob));

        }

        start(context, radius, width, height, x, y){
            var _ = this;
            _.worker.postMessage({
                context: context,
                radius: radius,
                metrix: {
                    width: width,
                    height: height,
                    x: x,
                    y: y
                }
            })

            return new Promise(function(res, rej){
                _.worker.onmessage = function(e){
                    res(e.data)
                    _.worker.terminate()
                }
            })
        }
    }

    async function decASYNC(x, y, w, h, r, imagedata, index, of){
        thread = new SThread();
        
        return new Promise(function(res, rej){
            thread.start(imagedata, r, w, h, x, y).then(function(data){
                data.iterate = {
                    number: index,
                    of: of - 1
                }
                res(data)
            })
        })
    }

    blur.prototype.blurRegion = function(x, y, w, h, imagedata){
        var avg = null,
            pos,
            data = imagedata ? cut(imagedata, x, y, w, h) : this.ctx.getImageData(x, y, w, h);

        if(window.Worker && !this.usemainthread && this.threads != 1){
            if((this.threads % 2) != 0)
                this.threads += 1

            var tc = Math.round(this.threads / 2),
                bl = blocks(data.width, data.height, Math.floor(data.width / tc), Math.floor(data.height / tc));

            for(var i = 0;i < bl.length;i++){
                decASYNC(bl[i].x, bl[i].y, bl[i].w, bl[i].h, this.radius, data, i, bl.length).then(function(data){
                    this.ctx.putImageData(data.d, data.m.x + x, data.m.y + y)
                })
            }

            return;
        }else if(window.Worker && !this.usemainthread && this.threads == 1){
            decASYNC(0, 0, data.width, data.height, this.radius, data, 1, 1).then(function(data){
                this.ctx.putImageData(data.d, x, y)
            })

            return;
        }

        for(var cx = 0;cx < w;cx++)
            for(var cy = 0;cy < h;cy++){
                pos = 4 * (cx + cy * w);
                avg = getAverage(data, this.radius, cx, cy);
                data.data[pos] = avg[0];
                data.data[pos+1] = avg[1];
                data.data[pos+2] = avg[2];
                data.data[pos+3] = avg[3];
            }

        this.ctx.putImageData(data, x, y)
    }

    blur.prototype.blur = function(imagedata){
        var avg = null,
            pos,
            data = imagedata || this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        if(window.Worker && !this.usemainthread && this.threads != 1){
            if((this.threads % 2) != 0)
                this.threads += 1

            var tc = Math.round(this.threads / 2),
                bl = blocks(data.width, data.height, Math.floor(data.width / tc), Math.floor(data.height / tc)),
                tn = 0,
                rt = {
                    render: function(func){
                        rt.render = func;
                    }
                }

            for(var i = 0;i < bl.length;i++){
                decASYNC(bl[i].x, bl[i].y, bl[i].w, bl[i].h, this.radius, data, i, bl.length).then(function(data){
                    this.ctx.putImageData(data.d, data.m.x, data.m.y);
                    if(typeof rt.render == "function")
                        rt.render(data)
                    
                })
            }

            return rt;
        }else if(window.Worker && !this.usemainthread && this.threads == 1){
            var rt = {
                render: function(func){
                    rt.render = func;
                }
            }

            decASYNC(0, 0, data.width, data.height, this.radius, data, 1, 1).then(function(data){
                this.ctx.putImageData(data.d, 0, 0)
                if(typeof rt.render == "function")
                    rt.render(data)
            })
            return;
        }

        for(var x = 0;x < data.width;x++)
            for(var y = 0;y < data.height;y++){
                pos = 4 * (x + y * data.width);
                avg = getAverage(data, this.radius, x, y);
                data.data[pos] = avg[0];
                data.data[pos+1] = avg[1];
                data.data[pos+2] = avg[2];
                data.data[pos+3] = avg[3];
            }
        
        this.ctx.putImageData(data, 0, 0);
    }
})()