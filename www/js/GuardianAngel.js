// TODO: Make better splash screen
// TODO: Icon
// TODO: Make work in Portrait
// TODO: Efficiency
// TODO: Don't use === for numbers (all numbers are floats)
// TODO: Better styles for the Settings screen
// TODO: Show dial in red if exceeding max angle?
// TODO: Show max angles in Ride Info screen
// TODO: Reduce permissions: phone status&identity, record audio, SD card(?), audio settings
// TODO: Show settings at startup, or hide the settings screen
// TODO: Change name to Guardian Angel (with space)
// TODO: Add a licence to GitHub: code cannot be reused commercially

/**
 * MaxLeanInfo
 * -----------
 * A small class holding information about a maximum lean angle and where it occurred.
 * @constructor
 */
function MaxLeanInfo(element) {
    this.leanAngle = 0.0;
    this.latitude = 0.0;
    this.longitude = 0.0;
    this.element  = element;
    this.map = null;
}
MaxLeanInfo.prototype.clear = function() {
    this.leanAngle = 0.0;
    this.latitude = 0.0;
    this.longitude = 0.0;
};


/**
 * GuardianAngel
 * -------------
 * Code to manage the Guardian Angel app.
 *
 * @constructor
 */
function GuardianAngel() {
    try{
        this.log("Guardian Angel starting.");

        var that = this;

        // We load the settings...
        this.settings = {
            phoneNumbers: "",
            crashLeanAngle: 50.0,
            warningSecondsBeforeSendingTexts: 30,
            numberTexts: 3,
            sendTextsEveryNSeconds: 60,
            speedUnits: "mph",
            crashMessage: "My bike has fallen over!"
        };
        this.loadSettings();
        this.showSettings();

        // We register events to be triggered when settings are changed, so
        // we can update and save them...
        $(".setting").keyup(function(eventData){ that.onSettingsUpdated(); });
        $(".setting").click(function(eventData){ that.onSettingsUpdated(); });

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
        this.maxLeftLeanInfo = new MaxLeanInfo($("#max-left-lean"));
        this.maxRightLeanInfo = new MaxLeanInfo($("#max-right-lean"));

        // The Media object that plays the alert sound when a crash is detected...
        this.alertSound = null;
        this.alertPlaying = false;

        // We find the platform, in particular noting whether it is Android (as
        // media files are handled differently) or Windows (where I am testing in
        // the browser)...
        this.isWindows = false;
        this.isAndroid = false;
        this.findPlatform();

        // Countdown seconds before sending a text, after a crash has been detected,
        // and a timer to do the countdown...
        this.textCountdownSeconds = 0;
        this.textCountdownTimer = null;
        this.numberTextsRemaining = 0;

        // We create maps to show max lean angles...
        this.createMaps();

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

        // We start the GPS...
        this.log("Starting GPS.")
        this.currentLatitude = 0.0;
        this.currentLongitude = 0.0;
        this.gps = navigator.geolocation.watchPosition(
            function(position) { that.onGPSSuccess(position); },
            function(error) { that.onGPSError(error); },
            { timeout: 30000, enableHighAccuracy: true });

        // We register the Start button click...
        this.log("Registering Start button click event.");
        $("#start-button").click(function() { that.onStartButtonClicked(); });

        // We register the crash-detected button click (ie, button to cancel crash detection)...
        this.log("Registering crash-detection button click event.");
        $("#crash-detected-button").click(function() { that.clearCrashDetection(); });

        // We set the crash-detection page to its default, ie no crash detected...
        this.clearCrashDetection();
    } catch(err) {
        this.error(err.message);
        alert(err.message);
    }
}

// An enum for the slides we show...
GuardianAngel.Slide = {
    SETTINGS: 0,
    LEAN_ANGLE: 1,
    RIDE_INFO: 2,
    CRASH_DETECTION: 3,
    LOGS: 4
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
        // button has been pressed, in case the device is not exactly central...
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
            if(absLean > this.maxLeftLeanInfo.leanAngle) {
                this.updateMaxLeanAngle(absLean, this.maxLeftLeanInfo);
                //this.updateMaxLeftLean(absLean);
            }
        } else {
            if(absLean > this.maxRightLeanInfo.leanAngle) {
                this.updateMaxLeanAngle(absLean, this.maxRightLeanInfo);
            }
        }
    } catch(err) {
        this.error(err.message);
    }
};

/**
 * updateMaxLeanAngle
 * ------------------
 * Shows the max lean angle, and updates the map showing it.
 */
GuardianAngel.prototype.updateMaxLeanAngle = function(leanAngle, leanInfo) {
    // We update the information we hold...
    leanInfo.leanAngle = leanAngle;
    leanInfo.latitude = this.currentLatitude;
    leanInfo.longitude = this.currentLongitude;

    // We show the max lean angle on the Ride page...
    leanInfo.element.text(leanAngle.toFixed(1));

    // TODO: Maybe update the map on a timer to avoid too many quick updates.
    // We update the map...
    leanInfo.map.removeMarkers();
    leanInfo.map.setCenter(this.currentLatitude, this.currentLongitude);
    leanInfo.map.addMarker({lat: this.currentLatitude, lng: this.currentLongitude});
};

/**
 * onCrashDetected
 * ---------------
 * Called when a crash has been detected.
 */
GuardianAngel.prototype.onCrashDetected = function() {
    try {
        this.log("Crash detected.")

        // TODO: this can be called while crash detection is running. Check this.
        // We show the crash detection page...
        this.swiper.slideTo(GuardianAngel.Slide.CRASH_DETECTION);
        $("#crash-not-detected-text").hide();
        $("#crash-detected-button-wrapper").show();
        $("#crash-detected-timer").text(this.settings.warningSecondsBeforeSendingTexts);
        $("#crash-detected-timer-text").show();

        // We play the alert sound...
        this.playAlertSound();

        // We start the countdown timer for sending texts...
        var that = this;
        this.textCountdownSeconds = this.settings.warningSecondsBeforeSendingTexts;
        this.numberTextsRemaining = this.settings.numberTexts;
        this.textCountdownTimer = setInterval(
            function() {
                that.onTextCountdownTimer();
            }, 1000);
    } catch(err) {
        this.error(err.message);
    }
};

/**
 * onTextCountdownTimer
 * --------------------
 * Called when the text-countdown timer ticks. When the countdown reaches
 * zero, we send a text.
 */
GuardianAngel.prototype.onTextCountdownTimer = function() {
    try {

        if(this.numberTextsRemaining == 0) {
            this.clearCrashDetection();
            return;
        }

        // We count down the timer...
        this.textCountdownSeconds--;
        $("#crash-detected-timer").text(this.textCountdownSeconds);

        if(this.textCountdownSeconds > 0) {
            return;
        }

        // The countdown has reached zero, so we send texts...
        this.sendTexts();
    } catch(err) {
        this.error(err.message);
    }
};

/**
 * sendTexts
 * ---------
 * Sends texts to the list of numbers specified in the settings, to say that we have crashed.
 */
GuardianAngel.prototype.sendTexts = function()  {
    // We create the message to send, including the current location...
    var latlongString = this.currentLatitude + "+" + this.currentLongitude;
    var message = this.settings.crashMessage +
        " https://maps.google.com/maps?q=" +
        this.currentLatitude + "," + this.currentLongitude;

    // We parse the collection of numbers...
    var phoneNumbers = this.settings.phoneNumbers.split(",");
    for(var i=0; i<phoneNumbers.length; ++i) {
        var phoneNumber = phoneNumbers[i];
        this.log("Sending text to: " + phoneNumber + ". Message: " + message);

        // We do not send a text if we are running the the desktop (test) browser...
        if(this.isWindows) {
            continue;
        }

        var smsOptions = {
            replaceLineBreaks: false,
            android: {intent: ''}  // Sends SMS without open any other app
        };
        sms.send(
            phoneNumber,
            message,
            smsOptions,
            function() {
                // On success...
                this.log("SMS sent");
            },
            function() {
                // On error...
                this.error("SMS failed to send.");
            });
    }

    // We may be sending more texts...
    this.numberTextsRemaining--;
    this.textCountdownSeconds = this.settings.sendTextsEveryNSeconds;
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
    startButtonElement.html('<i class="icon-stop"></i> Press to stop ride');
    startButtonElement.css("background-color", "green");

    // We reset the max and min leans...
    this.maxLeftLeanInfo.clear();
    this.maxRightLeanInfo.clear();
    this.maxLeftLeanInfo.element.text("0.0");
    this.maxRightLeanInfo.element.text("0.0");

    // We clear the crash detection page...
    this.clearCrashDetection();

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
    startButtonElement.html('<i class="icon-play"></i> Press to start ride');
    startButtonElement.css("background-color", "red");

    // We move to the ride-info slide...
    this.swiper.slideTo(GuardianAngel.Slide.RIDE_INFO);
};

/**
 * clearCrashDetection
 * -------------------
 * Clears the crash-detection page and associated timers.
 */
GuardianAngel.prototype.clearCrashDetection = function() {
    $("#crash-not-detected-text").show();
    $("#crash-detected-button-wrapper").hide();
    $("#crash-detected-timer-text").hide();
    this.stopAlertSound();
    if(this.textCountdownTimer) {
        clearInterval(this.textCountdownTimer);
        this.textCountdownTimer = null;
    }
};

/**
 * loadSettings
 * ------------
 * Loads settings, and sets them to defaults if they have not previously been stored.
 */
GuardianAngel.prototype.loadSettings = function() {
    this.log("Loading settings.")

    // We load the fields in the settings...
    for(var field in this.settings) {
        var defaultValue = this.settings[field];
        var defaultValueType = typeof(defaultValue);

        // We try to load the setting...
        var storedValue = localStorage.getItem(field);
        if(storedValue === null) {
            // The data is not stored, so we store the default...
            localStorage.setItem(field, String(defaultValue));
            this.log("Storing default value for settings field: " + field + "=" + defaultValue);
        } else {
            // The data is stored, so we use it - first converting it...
            if(defaultValueType === "string") {
                this.settings[field] = storedValue;
            } else if(defaultValueType === "number"){
                this.settings[field] = Number(storedValue);
            } else {
                this.error("Could not convert type for settings field: " + field);
                continue;
            }
            this.log("Loaded settings field: " + field + "=" + this.settings[field]);
        }
    }
};

/**
 * storeSettings
 * -------------
 * Stores the current value of the settings.
 */
GuardianAngel.prototype.storeSettings = function() {
    for(var field in this.settings) {
        localStorage.setItem(field, String(this.settings[field]));
    }
};

/**
 * onGPSSuccess
 * ------------
 * Called when we get updated GPS information.
 */
GuardianAngel.prototype.onGPSSuccess = function(position) {
    try {
        var coords = position.coords;

        // We show the GPS accuracy in meters, and color code it.
        // Accuracy better that 10m usually means that you have a good GPS fix.
        var accuracy = coords.accuracy;
        $("#gps-accuracy").text(accuracy.toFixed(1));
        if(accuracy > 30) {
            $("#gps-accuracy").css("color", "red");
        } else if(accuracy > 9.9) {
            $("#gps-accuracy").css("color", "orange");
        } else {
            $("#gps-accuracy").css("color", "green");
        }

        // We store the current latitude and longitude...
        this.currentLatitude = coords.latitude;
        this.currentLongitude = coords.longitude;

        // We show the speed, translating to either mph or kph...
        var speed = 0.0;
        var speedFactor = 0.0;
        var speedUnitsElement = $("#gps-speed-units");
        if(this.settings.speedUnits === "mph") {
            speedFactor = 2.23694;
            speedUnitsElement.text("mph");
        } else if(this.settings.speedUnits === "kph") {
            speedFactor = 3.6;
            speedUnitsElement.text("kph");
        }

        if(coords.speed) {
            speed = coords.speed * speedFactor;
        }
        $("#gps-speed").text(speed.toFixed(0));
    } catch(err) {
        this.error(err.message);
    }
};

/**
 * onGPSError
 * ----------
 * Called if we get an error from the GPS.
 */
GuardianAngel.prototype.onGPSError = function(error) {
    try {
        this.error("GPS error: " + error.message);
    } catch(err) {
        this.error(err.message);
    }
};

/**
 * findPlatform
 * ------------
 * We check which device we are running on. In particular we note if we are on
 * Android, as paths to sound files need to be treated differently.
 */
GuardianAngel.prototype.findPlatform = function() {
    var platform = navigator.userAgent;
    this.log("Platform: " + platform);

    this.isAndroid = platform.toUpperCase().indexOf("ANDROID") > -1;
    this.isWindows = platform.toUpperCase().indexOf("WINDOWS NT") > -1;
    this.log("isAndroid: " + this.isAndroid);
    this.log("isWindows: " + this.isWindows);
};

/**
 * playAlertSound
 * --------------
 * Plays the alert sound on a loop.
 */
GuardianAngel.prototype.playAlertSound = function() {
    this.log("Playing alert sound.");

    // If we are testing on the browser in Windows, we do not play sounds, as
    // the PhoneGap Media object is not available)...
    if(this.isWindows) {
        return;
    }

    // We stop any existing alert sound...
    this.stopAlertSound();

    // And create a new one...
    var path = "";
    if(this.isAndroid) {
        path = "/android_asset/www/sounds/siren.mp3";
    } else {
        path = "sounds/siren.mp3";
    }

    var that = this;
    this.alertSound = new Media(
        path,
        null,
        null,
        function(status) {
            // Called when the status changes. If the sound has finished playing,
            // but we should still be playing it, we loop it...
            if( status === Media.MEDIA_STOPPED && that.alertPlaying) {
                that.alertSound.play();
            }
        });
    this.alertPlaying = true;
    this.alertSound.play();
};

/**
 * stopAlertSound
 * --------------
 * Stops the alert sound.
 */
GuardianAngel.prototype.stopAlertSound = function() {
    if(this.alertSound !== null) {
        this.alertPlaying = false;
        this.alertSound.stop();
        this.alertSound = null;
    }
};

/**
 * createMaps
 * ----------
 * Creates maps to show where max lean angles occur.
 */
GuardianAngel.prototype.createMaps = function() {
    this.log("Creating maps.");

    this.maxLeftLeanInfo.map = new GMaps({
        div: "#map-left",
        lat: 0.0,
        lng: 0.0,
        scaleControl: false,
        zoomControl: false,
        streetViewControl: false,
        panControl: false
    });

    this.maxRightLeanInfo.map = new GMaps({
        div: "#map-right",
        lat: 0.0,
        lng: 0.0,
        scaleControl: false,
        zoomControl: false,
        streetViewControl: false,
        panControl: false
    });
};

/**
 * onSettingsUpdated
 * -----------------
 * Called when any settings are edited. We update the settings and store them.
 */
GuardianAngel.prototype.onSettingsUpdated = function() {
    // We update the settings...
    this.settings.phoneNumbers = this.getSetting("settings-phone-numbers", "text");
    this.settings.crashLeanAngle = this.getSetting("settings-crash-lean-angle", "number");
    this.settings.warningSecondsBeforeSendingTexts = this.getSetting("settings-warning-seconds", "number");
    this.settings.numberTexts = this.getSetting("settings-number-texts", "number");
    this.settings.sendTextsEveryNSeconds = this.getSetting("settings-text-interval", "number");
    this.settings.speedUnits = this.getSetting("settings-speed-units", "radio");
    this.settings.crashMessage = this.getSetting("settings-crash-message", "text");

    // We store them...
    this.storeSettings();

    // We update the alert angle, used for detecting a crash...
    if(this.settings.crashLeanAngle > 0) {
        this.leanCalculator.setAlertAngle(this.settings.crashLeanAngle);
    }
};

/**
 * showSettings
 * ------------
 * Shows the settings.
 */
GuardianAngel.prototype.showSettings = function() {
    $("input:text[name=settings-phone-numbers]").val(this.settings.phoneNumbers);
    $("input:text[name=settings-crash-lean-angle]").val(this.settings.crashLeanAngle);
    $("input:text[name=settings-warning-seconds]").val(this.settings.warningSecondsBeforeSendingTexts);
    $("input:text[name=settings-number-texts]").val(this.settings.numberTexts);
    $("input:text[name=settings-text-interval]").val(this.settings.sendTextsEveryNSeconds);
    $("input:radio[name=settings-speed-units]").val([this.settings.speedUnits]);
    $("input:text[name=settings-crash-message]").val(this.settings.crashMessage);
};

/**
 * getSetting
 * ----------
 * Reads one of the inputs from the Settings screen.
 */
GuardianAngel.prototype.getSetting = function(name, type) {
    if(type === "radio") {
        return $("input:radio[name=" + name + "]:checked").val();
    }

    if(type === "text") {
        return $("input:text[name=" + name + "]").val();
    }

    if(type === "number") {
        return Number($("input:text[name=" + name + "]").val());
    }

    this.error("Failed to read setting: " + name + ". Requested type: " + type);
};
