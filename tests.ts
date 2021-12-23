// tests go here; this will not be compiled when this package is used as a library

let item = 0
basic.forever(() => {
    basic.showNumber(item)
})
YFRotaryEncoder.onPressEvent(() => {
    item = 0
})
YFRotaryEncoder.onRotateEvent(YFRotationDirection.Right, () => {
    item += -1
})
YFRotaryEncoder.onRotateEvent(YFRotationDirection.Left, () => {
    item += 1
})
item = 0
YFRotaryEncoder.init(Pins.P14, Pins.P15, Pins.P16)
basic.showNumber(0)
