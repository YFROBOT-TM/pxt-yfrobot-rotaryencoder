//% color="#45b787" weight=10 icon="\uf01e" 
namespace YFRotaryEncoder {

    /**
     * rotary encoder was rotated.
     */
    //% group="Only support V1.5"
    //% blockId=rotary_ky_rotated_left_event
    //% block="on rotated |%dir" shim=YFRotaryEncoder::onRotateEvent
    export function onRotateEvent(dir: YFRotationDirection, body: () => void): void{
        return;
    }

    // /**
    //  * rotary encoder button was pressed.
    //  */
    // group="Only support V1.5"
    // blockId=rotary_ky_pressed_event
    // block="on button pressed" shim=YFRotaryEncoder::onPressEvent
    function onPressEvent(body: () => void): void{
        return;
    }

    /**
     * initialises local variables and enables the rotary encoder.
     */ 
    //% group="Only support V1.5"
    //% blockId=rotary_ky_init
    // block="connect A %clk| B %dt| sw %sw"
    //% block="connect A %clk| B %dt"
    //% shim=YFRotaryEncoder::init
    // export function init(clk: YFPins, dt: YFPins, sw: YFPins): void{
    export function init(clk: YFPins, dt: YFPins): void{
        return;
    }
}