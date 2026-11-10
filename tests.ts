// tests go here; this will not be compiled when this package is used as a library
// 自测程序：顺时针加 1、逆时针减 1，转一格计 1 次。仅用于 pxt test / 本地验证。

YFRotaryEncoder.init(DigitalPin.P1, DigitalPin.P2)
basic.showNumber(YFRotaryEncoder.count())

YFRotaryEncoder.onRotate(YFRotationDirection.Right, () => {
    basic.showNumber(YFRotaryEncoder.count())
})

YFRotaryEncoder.onRotate(YFRotationDirection.Left, () => {
    basic.showNumber(YFRotaryEncoder.count())
})

YFRotaryEncoder.onAnyRotate(() => {
    if (YFRotaryEncoder.direction() == YFRotationDirection.Right) {
        led.plot(4, 0)
    } else {
        led.plot(0, 0)
    }
})
