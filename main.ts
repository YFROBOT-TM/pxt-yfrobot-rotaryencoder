/**
 * @file pxt-yfrobot-rotaryencoder/main.ts
 * @brief YFROBOT 旋转编码器（EC11 / KY-040 类）MakeCode 图形化编程扩展。
 * @n 纯 TypeScript 实现，不依赖 mbed/DAL，可在 micro:bit V1.5 与 V2 上通用。
 *
 * @copyright    YFROBOT,2026
 * @copyright    MIT License
 *
 * @author [email](yfrobot@qq.com)
 * @date  2026-11-10
 */

enum YFRotationDirection {
    //% block="left (CCW)"
    Left = 0,
    //% block="right (CW)"
    Right = 1
}

//% color="#45b787" weight=10 icon="\uf01e"
//% groups='["Basic", "Events", "Advanced"]'
namespace YFRotaryEncoder {

    // 一次计数后忽略的电平抖动时间（毫秒）
    const DEBOUNCE_MS = 5
    // 兜底轮询周期（毫秒）：即使引脚边沿事件没有触发，也能靠轮询统计
    const POLL_MS = 5
    // 按键消抖时间（毫秒）
    const BUTTON_MS = 30

    // 四状态（A、B 正交编码）译码表，下标 = 上次状态 * 4 + 本次状态
    // +1 / -1 表示转动一格，0 表示没有变化或丢失了半个周期
    const QDEC = [
        0, 1, -1, 0,
        -1, 0, 0, 1,
        1, 0, 0, -1,
        0, -1, 1, 0
    ]

    let clkPin: DigitalPin = null      // A 相（CLK）
    let dtPin: DigitalPin = null       // B 相（DT）
    let swPin: DigitalPin = null       // 按键（SW），未接为 null

    let stepCount = 0                  // 累计转动格数，右转 +1、左转 -1
    let lastDir = YFRotationDirection.Right
    let reversed = false               // 方向反转开关
    let lastState = -1                 // 上次采样的 (A<<1|B) 状态
    let lastStepAt = 0                 // 上次计数时刻，用于消抖

    let onLeftHandler: () => void = null
    let onRightHandler: () => void = null
    let onAnyHandler: () => void = null
    let onButtonHandler: () => void = null

    let buttonDown = false
    let lastButtonAt = 0
    let monitorStarted = false

    /**
     * 把旋转编码器接到 micro:bit（A、B 两相）。
     * 放在“当开机时”里，且必须在其它旋转编码器积木之前执行。
     * @param clk A 相（CLK）引脚，例如 DigitalPin.P1
     * @param dt B 相（DT）引脚，例如 DigitalPin.P2
     */
    //% blockId=YFRotaryEncoder_init
    //% block="connect rotary encoder |A (CLK) %clk |B (DT) %dt"
    //% group="Basic" weight=100 blockGap=8
    //% clk.fieldEditor="gridpicker" clk.fieldOptions.columns=4 clk.fieldOptions.tooltips="false"
    //% dt.fieldEditor="gridpicker" dt.fieldOptions.columns=4 dt.fieldOptions.tooltips="false"
    //% inlineInputMode=inline
    export function init(clk: DigitalPin, dt: DigitalPin): void {
        setup(clk, dt, null)
    }

    /**
     * 把旋转编码器接到 micro:bit（A、B 两相 + 按键）。
     * @param clk A 相（CLK）引脚，例如 DigitalPin.P1
     * @param dt B 相（DT）引脚，例如 DigitalPin.P2
     * @param sw 按键（SW）引脚，例如 DigitalPin.P0
     */
    //% blockId=YFRotaryEncoder_initWithButton
    //% block="connect rotary encoder |A (CLK) %clk |B (DT) %dt |button %sw"
    //% group="Basic" weight=99 blockGap=8
    //% clk.fieldEditor="gridpicker" clk.fieldOptions.columns=4 clk.fieldOptions.tooltips="false"
    //% dt.fieldEditor="gridpicker" dt.fieldOptions.columns=4 dt.fieldOptions.tooltips="false"
    //% sw.fieldEditor="gridpicker" sw.fieldOptions.columns=4 sw.fieldOptions.tooltips="false"
    //% inlineInputMode=inline
    export function initWithButton(clk: DigitalPin, dt: DigitalPin, sw: DigitalPin): void {
        setup(clk, dt, sw)
    }

    function setup(clk: DigitalPin, dt: DigitalPin, sw: DigitalPin): void {
        clkPin = clk
        dtPin = dt
        swPin = sw

        stepCount = 0
        lastDir = YFRotationDirection.Right
        lastState = -1
        lastStepAt = 0
        buttonDown = false
        lastButtonAt = 0

        // EC11 的 A/B 为开漏/干接点输出，统一开内部上拉，没有外接上拉也能用
        pins.setPull(clk, PinPullMode.PullUp)
        pins.setPull(dt, PinPullMode.PullUp)
        if (sw != null) {
            pins.setPull(sw, PinPullMode.PullUp)
        }

        lastState = ((pins.digitalReadPin(clk) << 1) | pins.digitalReadPin(dt))

        // 先启动后台轮询：即使下面注册边沿事件失败，也能靠轮询正常工作
        startMonitor()

        // 硬件边沿事件：转得快时不丢格。四个回调共用同一套状态机，不会重复计数。
        try {
            pins.onPulsed(clk, PulseValue.High, sampleEncoder)
            pins.onPulsed(clk, PulseValue.Low, sampleEncoder)
            pins.onPulsed(dt, PulseValue.High, sampleEncoder)
            pins.onPulsed(dt, PulseValue.Low, sampleEncoder)
        } catch (e) {
            // 个别引脚/固件不支持脉冲事件时忽略，轮询继续工作
        }
    }

    /**
     * 采样一次 A/B 电平并更新状态机。
     * 只在 A 相下降沿（一个机械格的中点）输出一格计数，因此每格只加 1。
     */
    function sampleEncoder(): void {
        if (clkPin == null || dtPin == null) return

        let a = pins.digitalReadPin(clkPin)
        let b = pins.digitalReadPin(dtPin)
        let state = ((a << 1) | b)
        if (state == lastState) return

        let prev = lastState
        lastState = state

        if (prev < 0) return
        let delta = QDEC[prev * 4 + state]
        if (delta == 0) return

        // 只在 A 相由高变低时记一格：一格 = 一个完整的正交周期
        if ((prev & 2) == 0 || (state & 2) != 0) return

        let now = control.millis()
        if (now - lastStepAt < DEBOUNCE_MS) return
        lastStepAt = now

        let clockwise = delta < 0        // 与旧版库的方向定义保持一致
        if (reversed) clockwise = !clockwise

        lastDir = clockwise ? YFRotationDirection.Right : YFRotationDirection.Left
        if (clockwise) stepCount += 1
        else stepCount -= 1

        let handler = clockwise ? onRightHandler : onLeftHandler
        if (handler != null) control.runInParallel(handler)
        if (onAnyHandler != null) control.runInParallel(onAnyHandler)
    }

    /**
     * 后台任务：兜底轮询编码器电平 + 监测按键状态。
     */
    function startMonitor(): void {
        if (monitorStarted) return
        monitorStarted = true

        control.inBackground(() => {
            while (true) {
                sampleEncoder()

                if (swPin != null) {
                    let down = pins.digitalReadPin(swPin) == 0
                    if (down != buttonDown) {
                        let now = control.millis()
                        if (now - lastButtonAt >= BUTTON_MS) {
                            lastButtonAt = now
                            buttonDown = down
                            if (down && onButtonHandler != null) {
                                control.runInParallel(onButtonHandler)
                            }
                        }
                    }
                }

                basic.pause(POLL_MS)
            }
        })
    }

    /**
     * 当旋转编码器向指定方向转过一格时，执行一段程序。
     * @param dir 方向，例如 YFRotationDirection.Right
     * @param body 要执行的程序
     */
    //% blockId=YFRotaryEncoder_onRotate
    //% block="on rotary encoder turned %dir"
    //% group="Events" weight=95 blockGap=8
    export function onRotate(dir: YFRotationDirection, body: () => void): void {
        if (dir == YFRotationDirection.Right) onRightHandler = body
        else onLeftHandler = body
    }

    /**
     * 当旋转编码器向任意方向转过一格时，执行一段程序（方向用“旋转方向”积木读取）。
     * @param body 要执行的程序
     */
    //% blockId=YFRotaryEncoder_onAnyRotate
    //% block="on rotary encoder turned (any direction)"
    //% group="Events" weight=94 blockGap=8 advanced=true
    export function onAnyRotate(body: () => void): void {
        onAnyHandler = body
    }

    /**
     * 当旋转编码器的按键被按下时，执行一段程序。
     * @param body 要执行的程序
     */
    //% blockId=YFRotaryEncoder_onButtonPressed
    //% block="on rotary encoder button pressed"
    //% group="Events" weight=93 blockGap=8
    export function onButtonPressed(body: () => void): void {
        onButtonHandler = body
    }

    /**
     * 最近一次转动的方向。
     */
    //% blockId=YFRotaryEncoder_direction
    //% block="turning direction"
    //% group="Events" weight=60 advanced=true
    export function direction(): YFRotationDirection {
        return lastDir
    }

    /**
     * 旋转编码器的计数值：右转 +1，左转 -1，可正可负。
     */
    //% blockId=YFRotaryEncoder_count
    //% block="rotary encoder count"
    //% group="Basic" weight=90 blockGap=8
    export function count(): number {
        return stepCount
    }

    /**
     * 把计数值清零（从 0 重新开始）。
     */
    //% blockId=YFRotaryEncoder_clearCount
    //% block="clear rotary encoder count"
    //% group="Basic" weight=89 blockGap=8
    export function clearCount(): void {
        stepCount = 0
    }

    /**
     * 旋转编码器的按键现在是否被按住。
     */
    //% blockId=YFRotaryEncoder_isButtonPressed
    //% block="rotary encoder button is pressed"
    //% group="Basic" weight=70 blockGap=8
    export function isButtonPressed(): boolean {
        if (swPin == null) return false
        return pins.digitalReadPin(swPin) == 0
    }

    /**
     * 手工设定计数值（例如限制在 0~100 范围内时使用）。
     * @param value 新的计数值，例如 0
     */
    //% blockId=YFRotaryEncoder_setCount
    //% block="set rotary encoder count to %value"
    //% group="Advanced" weight=41 blockGap=8 advanced=true
    export function setCount(value: number): void {
        stepCount = Math.round(value)
    }

    /**
     * 反转旋转方向：接线顺序相反（A/B 接反）时用它纠正。
     * @param enable 是否反转，例如 true
     */
    //% blockId=YFRotaryEncoder_setReverse
    //% block="reverse rotation direction %enable"
    //% group="Advanced" weight=40 blockGap=8 advanced=true
    //% enable.shadow="toggleOnOff"
    export function setReverse(enable: boolean): void {
        reversed = !!enable
    }
}
