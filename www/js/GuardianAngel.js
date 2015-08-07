/**
 * GuardianAngel
 * -------------
 * Code to manage the Guardian Angel app.
 */

/**
 * @constructor
 */
function GuardianAngel() {
    this._swiper = new Swiper('.swiper-container', {
        initialSlide: 1,
        pagination: '.swiper-pagination',
        paginationClickable: true
    });
}

// An enum for the slides we show...
GuardianAngel.Slide = {
    SETTINGS: 0,
    LEAN_ANGLE: 1,
    MAPS: 2,
    LOGS: 3
};

