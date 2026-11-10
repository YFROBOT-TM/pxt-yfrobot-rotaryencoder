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
    //% block="counter-clockwise"
    Left = 0,
    //% block="clockwise"
    Right = 1
}

//% color="#45b787" weight=10 icon="\uf01e"
//% groups='["Basic", "Events", "Advanced"]'
namespace YFRotaryEncoder {

    // 一次脉冲后忽略的电平抖动时间（毫秒）
    const DEBOUNCE_MS = 3
    // 兜底轮询周期（毫秒）：即使引脚边沿事件没有触发，也能靠轮询统计
    const POLL_MS = 5
    // 按键消抖时间（毫秒）
    const BUTTON_MS = 30

    // 四状态（A、B 正交编码）译码表，下标 = 上次状态 * 4 + 本次状态
    // +1 / -1 表示前进/后退一个正交状态，0 表示没变化或丢失了半个周期
    const QDEC = [
        0, 1, -1, 0,
        -1, 0, 0, 1,
        1, 0, 0, -1,
        0, -1, 1, 0
    ]

    let clkPin: DigitalPin = null      // A 相（CLK）
    let dtPin: DigitalPin = null       // B 相（DT）
    let swPin: DigitalPin = null       // 按键（SW），未接为 null

    // 每格对应的正交状态数。实测本模块相邻两格之间只走 2 个状态
    // （一个完整的 A/B 周期 = 2 格），所以默认 2：转一格计 1 次。
    let pulsesPerDetent = 2
    let stepAcc = 0                    // 不足一格的余量，累积满一格才输出

    let stepCount = 0                  // 累计转动格数，顺时针 +1、逆时针 -1
    let lastDir = YFRotationDirection.Right
    let reversed = false               // 方向反转开关
    let lastState = -1                 // 上次采样的 (A<<1|B) 状态
    let lastStepAt = 0                 // 上次采样时刻，用于消抖

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
     * 当前模块未引出按键引脚，积木已隐藏，保留接口以便后续硬件升级。
     * @param clk A 相（CLK）引脚，例如 DigitalPin.P1
     * @param dt B 相（DT）引脚，例如 DigitalPin.P2
     * @param sw 按键（SW）引脚，例如 DigitalPin.P0
     */
    //% blockId=YFRotaryEncoder_initWithButton
    //% block="connect rotary encoder |A (CLK) %clk |B (DT) %dt |button %sw"
    //% group="Basic" weight=99 blockGap=8
    //% blockHidden=1
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
        stepAcc = 0
        lastDir = YFRotationDirection.Right
        lastState = -1
        lastStepAt = 0
        buttonDown = false
        lastButtonAt = 0

        // EC11 的 A/B 为干接点/开漏输出，统一开内部上拉，没有外接上拉也能用
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
     * 每走一个正交状态累加 ±1，累积满「每格脉冲数」才输出一格；
     * 抖动只会来回抵消，不会多计。
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

        let now = control.millis()
        if (now - lastStepAt < DEBOUNCE_MS) return
        lastStepAt = now

        // 旧版库中「A 相下降沿 + B 为高」= 顺时针，这里沿用同样的方向定义
        let clockwise = delta < 0
        if (reversed) clockwise = !clockwise

        stepAcc += clockwise ? 1 : -1
        if (stepAcc >= pulsesPerDetent) {
            stepAcc -= pulsesPerDetent
            emitStep(true)
        } else if (stepAcc <= -pulsesPerDetent) {
            stepAcc += pulsesPerDetent
            emitStep(false)
        }
    }

    function emitStep(clockwise: boolean): void {
        lastDir = clockwise ? YFRotationDirection.Right : YFRotationDirection.Left
        if (clockwise) stepCount += 1
        else stepCount -= 1

        let handler = clockwise ? onRightHandler : onLeftHandler
        if (handler != null) control.runInParallel(handler)
        if (onAnyHandler != null) control.runInParallel(onAnyHandler)
    }

    /**
     * 后台任务：兜底轮询编码器电平 + 监测按键状态（按键功能暂未启用）。
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
    //% group="Events" weight=94 blockGap=8
    export function onAnyRotate(body: () => void): void {
        onAnyHandler = body
    }

    /**
     * 最近一次转动的方向。
     */
    //% blockId=YFRotaryEncoder_direction
    //% block="turning direction"
    //% group="Events" weight=93 blockGap=8
    export function direction(): YFRotationDirection {
        return lastDir
    }

    /**
     * 当旋转编码器的按键被按下时，执行一段程序。
     * 当前模块未引出按键引脚，积木已隐藏。
     * @param body 要执行的程序
     */
    //% blockId=YFRotaryEncoder_onButtonPressed
    //% block="on rotary encoder button pressed"
    //% group="Events" weight=92 blockGap=8
    //% blockHidden=1
    export function onButtonPressed(body: () => void): void {
        onButtonHandler = body
    }

    /**
     * 旋转编码器的计数值：顺时针一格 +1，逆时针一格 -1，可正可负。
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
        stepAcc = 0
    }

    /**
     * 旋转编码器的按键现在是否被按住。
     * 当前模块未引出按键引脚，积木已隐藏。
     */
    //% blockId=YFRotaryEncoder_isButtonPressed
    //% block="rotary encoder button is pressed"
    //% group="Basic" weight=70 blockGap=8
    //% blockHidden=1
    export function isButtonPressed(): boolean {
        if (swPin == null) return false
        return pins.digitalReadPin(swPin) == 0
    }

    /**
     * 反转旋转方向：接线顺序相反（A/B 接反）时用它纠正。
     * @param enable 是否反转，例如 true
     */
    //% blockId=YFRotaryEncoder_setReverse
    //% block="reverse rotation direction %enable"
    //% group="Basic" weight=60 blockGap=8
    //% enable.shadow="toggleOnOff"
    export function setReverse(enable: boolean): void {
        reversed = !!enable
        stepAcc = 0
    }

    /**
     * 手工设定计数值（例如限制在 0~100 范围内时使用）。
     * @param value 新的计数值，例如 0
     */
    //% blockId=YFRotaryEncoder_setCount
    //% block="set rotary encoder count to %value"
    //% group="Advanced" weight=41 blockGap=8
    export function setCount(value: number): void {
        stepCount = Math.round(value)
        stepAcc = 0
    }

    /**
     * 设置每格对应的正交状态数，默认 2（转一格计 1 次）。
     * 若发现转一格跳 2 次就改成 4，转两格才跳 1 次就改成 1。
     * @param n 每格状态数，例如 2
     */
    //% blockId=YFRotaryEncoder_setPulsesPerDetent
    //% block="set pulses per detent to %n"
    //% group="Advanced" weight=40 blockGap=8
    //% n.min=1 n.max=8 n.defl=2
    export function setPulsesPerDetent(n: number): void {
        let v = Math.round(n)
        if (v < 1) v = 1
        if (v > 8) v = 8
        pulsesPerDetent = v
        stepAcc = 0
    }
}
