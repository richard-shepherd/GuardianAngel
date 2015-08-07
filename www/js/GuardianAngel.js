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
        this.log("Guardian Angel starting.");

        // We load the settings...
        this.settings = {
            phoneNumbers: "",
            crashLeanAngle: 60.0,
            warningSecondsBeforeSendingTexts: 30,
            numberTexts: 3,
            sendTextsEveryNSeconds: 60
        };
        this.loadSettings();

        var that = this;

        // True if the ride has started, ie the Start button has been pressed...
        this.rideStarted = false;

        // The lean angle when the Start button is pressed. We show lean angles
        // relative to this, to compensate for the device not being exactly straight.
        this.centeredLeanAngle = 0.0;

        // We hold the last lean-angle shown in the dial, and a movement tolerance. This
        // avoids redrawing the dial for small movements...
        this.previousLeanAngleDisplayed = 999.9;
        this.leanAngleDialSignificantChange = 2.0;

        // The maximum lean angles recorded in a session...
        this.maxLeftLean = 0.0;
        this.maxRightLean = 0.0;

        // We create the "swiper" which shows the slides...
        this.swiper = null;
        this.createSwiper();

        // The Raphael object used to draw the lean-angle dial...
        this.raphaelCanvas = null;
        this.leanAngleDial = null;
        this.createLeanAngleDial();

        // We start the lean-angle calculator.
        // This subscribes to the lean-angle and smooths it...
        this.log("Creating the lean-angle calculator.");
        this.leanCalculator = new LeanCalculator({
            callback: function(leanAngle) { that.onLeanAngleUpdated(leanAngle); },
            alertCallback: function() { that.onCrashDetected(); },
            alertAngle: this.settings.crashLeanAngle
        });

        // We register the Start button click...
        this.log("Registering Start button click event.");
        $("#start-button").click(function() { that.onStartButtonClicked(); });
    } catch(err) {
        this.error(err.message);
    }
}

// An enum for the slides we show...
GuardianAngel.Slide = {
    SETTINGS: 0,
    LEAN_ANGLE: 1,
    RIDE_INFO: 2,
    LOGS: 3
};

/**
 * createSwiper
 * ------------
 * Creates the object which manages the sliding "windows" for the app.
 */
GuardianAngel.prototype.createSwiper = function() {
    this.log("Creating swiper layout.");
    this.swiper = new Swiper('.swiper-container', {
        initialSlide: GuardianAngel.Slide.LEAN_ANGLE,
        pagination: '.swiper-pagination',
        paginationClickable: true
    });
};

/**
 * createLeanAngleDial
 * -----------------
 * Shows the lean-angle dial.
 */
GuardianAngel.prototype.createLeanAngleDial = function() {
    this.log("Creating the lean-angle dial.");

    var dialElement = $("#lean-angle-dial");
    var leanAngle_Width = dialElement.width();
    var leanAngle_Height = dialElement.height();
    var dialRadius = leanAngle_Width / 3.0;
    var offsetX = leanAngle_Width / 2.0;
    var offsetY = leanAngle_Width / 2.0;
    var centerRadius = leanAngle_Width / 40.0;
    var labelOffset = leanAngle_Width / 20.0;
    var labelFontSize = leanAngle_Width / 20.0;

    this.raphaelCanvas = new Raphael("lean-angle-dial", leanAngle_Width, leanAngle_Height);
    this.leanAngleDial = new wso2vis.ctrls.CGauge()
        .dialRadius(dialRadius)
        .smallTick(2) .largeTick(10)
        .minVal(-60) .maxVal(60)
        .minAngle(90).maxAngle(270)
        .ltlen(18) .stlen(15)
        .needleCenterRadius(centerRadius) .needleBottom(centerRadius * 2.0)
        .labelOffset(labelOffset) .labelFontSize(labelFontSize)
        .create(this.raphaelCanvas, offsetX, offsetY);
};

/**
 * onLeanAngleUpdated
 * ------------------
 * Called with the latest lean angle.
 */
GuardianAngel.prototype.onLeanAngleUpdated = function(leanAngle) {
    try {
        // We use the current lean angle as the "center" angle until the Start
        // biutton has been pressed, in case the device is not exactly central...
        if(this.rideStarted === false) {
            this.centeredLeanAngle = leanAngle;
        }
        leanAngle -= this.centeredLeanAngle;

        // We only show the new angle on the dial if there has been a significant change...
        if(Math.abs(leanAngle - this.previousLeanAngleDisplayed) > this.leanAngleDialSignificantChange) {
            this.leanAngleDial.setValue(leanAngle);
            this.previousLeanAngleDisplayed = leanAngle;
        }

        // We check if the new angle is greater than the maximum angles held
        // for the current ride..
        var absLean = Math.abs(leanAngle);
        if(leanAngle < 0.0) {
            if(absLean > this.maxLeftLean) {
                this.maxLeftLean = absLean;
                $("#max-left-lean").text(this.maxLeftLean.toFixed(1));
            }
        } else {
            if(absLean > this.maxRightLean) {
                this.maxRightLean = absLean;
                $("#max-right-lean").text(this.maxRightLean.toFixed(1));
            }
        }
    } catch(err) {
        this.error(err.message);
    }
};

/**
 * onCrashDetected
 * ---------------
 * Called when a crash has been detected.
 */
GuardianAngel.prototype.onCrashDetected = function() {
    try {

    } catch(err) {
        this.error(err.message);
    }
};

/**
 * error
 * -----
 * Logs an error.
 */
GuardianAngel.prototype.error = function(text) {
    this.log("ERROR: " + text);
};

/**
 * log
 * ---
 * Adds a log line to the logs slide.
 */
GuardianAngel.prototype.log = function(text) {
    // We add the date/time to the message...
    var message = new Date().toLocaleTimeString() + ": " + text;

    var newElement = $("<div></div>");
    newElement.addClass("log-line").html(message);
    $("#log").prepend(newElement);
};

/**
 * onStartButtonClicked
 * --------------------
 * Called when the Start button is clicked.
 */
GuardianAngel.prototype.onStartButtonClicked = function() {
    try {
        if(this.rideStarted) {
            // We are currently running, so we stop...
            this.stopRide();
        } else {
            // We are not running, so we start...
            this.startRide();
        }
    } catch(err) {
        this.error(err.message);
    }
};

/**
 * startRide
 * ---------
 * Starts monitoring a ride.
 */
GuardianAngel.prototype.startRide = function() {
    // We change the button to say "Stop"...
    var startButtonElement = $("#start-button");
    startButtonElement.html('<i class="icon-stop"></i> Press to stop ');
    startButtonElement.css("background-color", "green");

    // We reset the max and min leans...
    this.maxLeftLean = 0.0;
    this.maxRightLean = 0.0;
    $("#max-left-lean").text("0.0");
    $("#max-right-lean").text("0.0");

    this.rideStarted = true;
};

/**
 * stopRide
 * --------
 * Stops monitoring a ride.
 */
GuardianAngel.prototype.stopRide = function() {
    this.rideStarted = false;

    // We change the button to say "Start"..
    var startButtonElement = $("#start-button");
    startButtonElement.html('<i class="icon-play"></i> Press to start');
    startButtonElement.css("background-color", "red");

    // We move to the ride-info slide...
    this.swiper.slideTo(GuardianAngel.Slide.RIDE_INFO);
};

/**
 * loadSettings
 * ------------
 * Loads settings, and sets them to defaults if they have not previously been stored.
 */
GuardianAngel.prototype.loadSettings = function() {
    this.log("Loading settings.")
};