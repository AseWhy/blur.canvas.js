# blur.canvas.js
 Library for all kinds of canvas blur

## Methods
Method                            |Function                                                                                   |
----------------------------------|-------------------------------------------------------------------------------------------|
constructor(**RenderingContext2D**, ?**Int** radius) | Constructor |
setRadius(**Int** radius)         |            Sets the blur radius                                                           |
setThreads(**Int** threads count) |Sets the number of threads for rendering **a large number of threads to crash the browser**|
useMainThread(**Boolean**)            |  If enabled, passing the parameter "**true**" will not allow to start rendering in this stream|
setDebug(**Boolean** value)  | enables, disables debugging mode. In debug mode, rendered areas are highlighted in green. |
setPower(**Enum** POWER) | Sets the blur strength.|
blurRegion(**Int** x, **Int** y, **Int** Width, **Int** Height, ?**ImageData** )                        | Blurs a region of the specified **height** and **width** at the specified coordinates *x* *y*. Also you can give third-party "**ImageData**" for blur it.
blur(?**ImageData**) | Blurs the **whole** image. Also you can give third-party "**ImageData**" for blur |

## Fields

### POWER
 * LOW_VERTICAL_ONLY - *Blurs only columns*
 * LOW_HORISONTAL_ONLY - *Blurs only rows*
 * MEDIUM_CROSS - *Blurs rows and colums*
 * HIGH - *Blurs a square with a specified radius*

## Usage example

```Js
 var ctx = document.getElementsByTagName("canvas")[0].getContext("2d");
 ctx.fillRect(10, 10, 10, 10);
 var _ = new Blur(ctx);
 _.setThreads(3)
 _.setRadius(45)
 _.setPower(POWER.MEDIUM_CROSS)
 _.blur().render(function(data){
     console.log(data)
 })
```

