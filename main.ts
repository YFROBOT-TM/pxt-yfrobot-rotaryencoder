//% color="#45b787" weight=10 icon="\uf01e" 
namespace YFRotaryEncoder {

    /**
     * rotary encoder was rotated.
     */
    //% blockId=rotary_ky_rotated_left_event
    //% block="on rotated |%dir" shim=YFRotaryEncoder::onRotateEvent
    export function onRotateEvent(dir: YFRotationDirection, body: () => void): void{
        return;
    }

    /**
     * rotary encoder button was pressed.
     */
    //% blockId=rotary_ky_pressed_event
    //% block="on button pressed" shim=YFRotaryEncoder::onPressEvent
    export function onPressEvent(body: () => void): void{
        return;
    }

    /**
     * initialises local variables and enables the rotary encoder.
     */ 
    //% blockId=rotary_ky_init
    //% block="connect A %clk| B %dt| sw %sw"
    //% shim=YFRotaryEncoder::init
    export function init(clk: Pins, dt: Pins, sw: Pins): void{
        return;
    }
}