// tests go here; this will not be compiled when this package is used as a library
// 自测程序：右转加 1、左转减 1、按键清零。仅用于 pxt test / 本地验证。

YFRotaryEncoder.initWithButton(DigitalPin.P1, DigitalPin.P2, DigitalPin.P0)
basic.showNumber(YFRotaryEncoder.count())

YFRotaryEncoder.onRotate(YFRotationDirection.Right, () => {
    basic.showNumber(YFRotaryEncoder.count())
})

YFRotaryEncoder.onRotate(YFRotationDirection.Left, () => {
    basic.showNumber(YFRotaryEncoder.count())
})

YFRotaryEncoder.onButtonPressed(() => {
    YFRotaryEncoder.clearCount()
    basic.showNumber(YFRotaryEncoder.count())
})

basic.forever(() => {
    if (YFRotaryEncoder.isButtonPressed()) {
        led.plot(0, 0)
    } else {
        led.unplot(0, 0)
    }
    basic.pause(50)
})
