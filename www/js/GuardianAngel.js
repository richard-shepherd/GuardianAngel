/**
 * GuardianAngel
 * -------------
 * Code to manage the Guardian Angel app.
 */

/**
 * @constructor
 */
function GuardianAngel() {
    try{
        // We create the "swiper" which shows the slides...
        this.swiper = new Swiper('.swiper-container', {
            initialSlide: 1,
            pagination: '.swiper-pagination',
            paginationClickable: true
        });

        // The Raphael object used to draw the lean-angle dial...
        this.raphaelCanvas = null;
        this.showLeanAngleDial();
    } catch(err) {
        alert(err.message);
    }
}

// An enum for the slides we show...
GuardianAngel.Slide = {
    SETTINGS: 0,
    LEAN_ANGLE: 1,
    MAPS: 2,
    LOGS: 3
};

/**
 * showLeanAngleDial
 * -----------------
 * Shows the lean-angle dial.
 */
GuardianAngel.prototype.showLeanAngleDial = function() {
    var leanAngle_Width = $("#lean-angle-dial").width();
    var leanAngle_Height = $("#lean-angle-dial").height();
    var dialRadius = leanAngle_Width / 3.0;
    var offsetX = leanAngle_Width / 2.0;
    var offsetY = leanAngle_Width / 2.0;
    var centerRadius = leanAngle_Width / 40.0;
    var labelOffset = leanAngle_Width / 20.0;
    var labelFontSize = leanAngle_Width / 20.0;

    this.raphaelCanvas = Raphael("lean-angle-dial", leanAngle_Width, leanAngle_Height);
    var leanAngleDial = new wso2vis.ctrls.CGauge()
        .dialRadius(dialRadius)
        .smallTick(2) .largeTick(10)
        .minVal(-60) .maxVal(60)
        .minAngle(90).maxAngle(270)
        .ltlen(18) .stlen(15)
        .needleCenterRadius(centerRadius) .needleBottom(centerRadius * 2.0)
        .labelOffset(labelOffset) .labelFontSize(labelFontSize)
        .create(this.raphaelCanvas, offsetX, offsetY);
};

