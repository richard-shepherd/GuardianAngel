// TODO: Make work in Portrait
// TODO: RideDataCalculator efficiency
// TODO: Add a licence to GitHub: code cannot be reused commercially
// TODO: Saw error GMaps is not defined: Happens when there is no network access to load google maps
// TODO: Don't record (or display) lean when speed less than (say) 10mph (configurable)
// TODO: Zoom to max speed - and show overlay label
// TODO: Zoom to max lean (left and right) - and show overlay label
// TODO: Add logging to RideDataCalculator.
// TODO: map-overlay css should all use vw, vh
// TODO: Calculate m/deg lat/long more accurately, from map center. (In particularly for longitude.)
// TODO: Lean seems to lag corners (which I suppose it would with the moving average). Turn down the averaging?
// TODO: Is it possible to show less precision in the map when we are zoomed out further?
// TODO: Change minimum zoom code: only set bounds if min-max > some distance, e.g. 200m
// TODO: "Share" or email ride to yourself. Maybe have a page on the computer that acts like a server.

/**
 * MinMaxRideData
 * --------------
 * Holds data about the maximum speed and lean angles and the maximum and
 * minimum latitude and longitude seen during a ride.
 *
 * @constructor
 */
function MinMaxRideData() {
    this.maxSpeed = 0.0;
    this.minLatitude = 999.0;
    this.maxLatitude = -999.0;
    this.minLongitude = 999.0;
    this.maxLongitude = -999.0;
    this.maxLeftLean = 0.0;
    this.maxRightLean = 0.0;
}


/**
 * GuardianAngel
 * -------------
 * Code to manage the Guardian Angel app.
 *
 * @constructor
 */
function GuardianAngel() {
    try{
        Logger.log("Guardian Angel starting.");

        var that = this;

        // We load the settings...
        this.settings = {
            phoneNumbers: "",
            crashLeanAngle: 50.0,
            warningSecondsBeforeSendingTexts: 30,
            numberTexts: 3,
            sendTextsEveryNSeconds: 60,
            speedUnits: "mph",
            crashMessage: "My bike has fallen over!",
            minSpeedForLeanAngle: 4.0 // meters per second
        };
        this.initializeSettings();

        // True if the ride has started, ie the Start button has been pressed...
        this.rideStarted = false;

        // For significant changes when drawing map points...
        this.mapSignificantDistanceMeters = 50.0;
        this.mapSignificantLeanDelta = 2.0;
        this.mapSignificantSpeedDelta = 2.0;  // meters per second
        this.mapSignificantDistanceMetersSquared = this.mapSignificantDistanceMeters * this.mapSignificantDistanceMeters;
        this.metersPerDegreeOfLatitude = 111304.0;
        this.metersPerDegreeOfLongitude = 65575.0; // TODO: Calculate this more accurately

        // For drawing the map...
        this.map = null;
        this.mapRedrawTimer = null;
        this.pointsPerMap = 25;

        // We hold the last lean-angle shown in the dial, and a movement tolerance. This
        // avoids redrawing the dial for small movements...
        this.previousLeanAngleDisplayed = 999.9;
        this.leanAngleDialSignificantChange = 2.0;

        // The min and max ride data recorded in a session, and the
        // collection of information about each point...
        this.minMaxRideData = new MinMaxRideData();
        this.rideDatas = [];
        this.rideDatasIndex = 0;

        // The Media object that plays the alert sound when a crash is detected...
        this.alertSound = null;
        this.alertPlaying = false;

        // True if a crash has been detected...
        this.crashDetected = false;

        // The most recent position...
        this.currentLatitude = 0.0;
        this.currentLongitude = 0.0;

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

        // We create the "swiper" which shows the slides...
        this.swiper = null;
        this.createSwiper();

        // The Raphael object used to draw the lean-angle dial...
        this.raphaelCanvas = null;
        this.leanAngleDial = null;
        this.createLeanAngleDial();

        // We start the ride-data calculator.
        // This subscribes to lean-angle, position and speed...
        Logger.log("Creating the ride-data calculator.");
        this.rideDataCalculator = new RideDataCalculator({
            callback: function(leanAngle) { that.onRideDataUpdated(leanAngle); },
            alertCallback: function() { that.onCrashDetected(); },
            alertAngle: this.settings.crashLeanAngle
        });

        // We register the Start button click...
        Logger.log("Registering Start button click event.");
        $("#start-button").click(function() { that.onStartButtonClicked(); });

        // We register the crash-detected button click (ie, button to cancel crash detection)...
        Logger.log("Registering crash-detection button click event.");
        $("#crash-detected-button").click(function() { that.clearCrashDetection(); });

        // We set the crash-detection page to its default, ie no crash detected...
        this.clearCrashDetection();

        // We setup the map-options...
        this.setupMapOptionsPanel();

        // We show the screen...
        $("#settings-slide").css("visibility", "visible");
    } catch(err) {
        Logger.error(err.message);
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

// An enum for map types...
GuardianAngel.MapType = {
    LEAN: 0,
    SPEED: 1
};

/**
 * initializeSettings
 * ------------------
 * Loads and shows settings.
 */
GuardianAngel.prototype.initializeSettings = function() {
    this.loadSettings();
    this.showSettings();

    // We register events to be triggered when settings are changed, so
    // we can update and save them...
    var settingElements = $(".setting");
    settingElements.keyup(function(eventData){ that.onSettingsUpdated(); });
    settingElements.click(function(eventData){ that.onSettingsUpdated(); });
};

/**
 * createSwiper
 * ------------
 * Creates the object which manages the sliding "windows" for the app.
 */
GuardianAngel.prototype.createSwiper = function() {
    Logger.log("Creating swiper layout.");
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
    Logger.log("Creating the lean-angle dial.");

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
 * onRideDataUpdated
 * ------------------
 * Called with the latest lean angle, position and speed.
 */
GuardianAngel.prototype.onRideDataUpdated = function(rideData) {
    try {
        // We update the stats...
        this.updateLeanAngles(rideData);
        this.updateSpeed(rideData);
        this.updateGPSInfo(rideData);

        // We store the point...
        if(rideData.speed < this.minSpeedForLeanAngle) {
            // We do not record lean angles at low speed...
            rideData.leanAngle = 0.0;
        }

        // We record the point, provided we've got a valid position...
        if(rideData.latitude !== 0.0 && rideData.longitude !== 0.0) {
            this.rideDatas[this.rideDatasIndex] = rideData;
            this.rideDatasIndex++;
        }

    } catch(err) {
        Logger.error(err.message);
    }
};

/**
 * updateGPSInfo
 * -------------
 * Updates latitude, longitude and GPS accuracy.
 */
GuardianAngel.prototype.updateGPSInfo = function(rideData) {
    // We store the latest position for sending with crash-detection texts...
    var latitude = rideData.latitude;
    var longitude = rideData.longitude;
    this.currentLatitude = latitude;
    this.currentLongitude = longitude;

    if(latitude > this.minMaxRideData.maxLatitude) this.minMaxRideData.maxLatitude = latitude;
    if(latitude < this.minMaxRideData.minLatitude) this.minMaxRideData.minLatitude = latitude;
    if(longitude > this.minMaxRideData.maxLongitude) this.minMaxRideData.maxLongitude = longitude;
    if(longitude < this.minMaxRideData.minLongitude) this.minMaxRideData.minLongitude = longitude;

    // We show the GPS accuracy in meters, and color code it.
    // Accuracy better that 10m usually means that you have a good GPS fix.
    var accuracy = rideData.gpsAccuracy;
    var gpsAccuracyElement = $("#gps-accuracy");
    gpsAccuracyElement.text(accuracy.toFixed(1));
    if(accuracy > 30) {
        gpsAccuracyElement.css("color", "red");
    } else if(accuracy > 9.9) {
        gpsAccuracyElement.css("color", "orange");
    } else {
        gpsAccuracyElement.css("color", "green");
    }
};

/**
 * updateSpeed
 * -----------
 * Updates the speed stats and dial.
 */
GuardianAngel.prototype.updateSpeed = function(rideData) {
    // We show the speed, translating to either mph or kph...
    var speedInfo = this.convertSpeed(rideData.speed);
    $("#gps-speed").text(speedInfo.speed.toFixed(0));
    $(".gps-speed-units").text(speedInfo.units);

    // We update the max speed...
    if(rideData.speed > this.minMaxRideData.maxSpeed) {
        this.minMaxRideData.maxSpeed = rideData.speed;
        $(".max-speed").text(rideData.speed.toFixed(0));
    }
};

/**
 * convertSpeed
 * ------------
 * Converts a speed from m/s to the units in the settings.
 *
 * Returns: { speed: [number], units: [string] }
 */
GuardianAngel.prototype.convertSpeed = function(metersPerSecond) {
    var speed = 0.0;
    var units = "";
    var speedFactor = 0.0;
    if(this.settings.speedUnits === "mph") {
        speedFactor = 2.23694;
        units = "mph";
    } else if(this.settings.speedUnits === "kph") {
        speedFactor = 3.6;
        units = "kph";
    }

    if(metersPerSecond) {
        speed = metersPerSecond * speedFactor;
    }

    return {
        speed: speed,
        units: units
    };
};

/**
 * updateLeanAngles
 * ----------------
 * Updates the lean angle dial and the min and max lean angles, if they
 * have changed.
 */
GuardianAngel.prototype.updateLeanAngles = function(rideData) {
    var leanAngle = rideData.leanAngle;
    if(Math.abs(leanAngle - this.previousLeanAngleDisplayed) > this.leanAngleDialSignificantChange) {
        this.leanAngleDial.setValue(leanAngle);
        this.previousLeanAngleDisplayed = leanAngle;
    }

    // We check if the new angle is greater than the maximum angles held
    // for the current ride.
    //
    // Note: We only check for max lean angles if the speed is greater than a minimum amount.
    //       This means that we do not count leans (for example) when turning at junctions,
    //       or when doing low-speed maneuvers.
    if(rideData.speed < this.settings.minSpeedForLeanAngle) {
        return;
    }

    var absLeanAngle = Math.abs(leanAngle);
    if(leanAngle < 0.0) {
        if(absLeanAngle > this.minMaxRideData.maxLeftLean) {
            this.minMaxRideData.maxLeftLean = absLeanAngle;
            $(".max-left-lean").text(absLeanAngle.toFixed(1));
        }
    } else {
        if(absLeanAngle > this.minMaxRideData.maxRightLean) {
            this.minMaxRideData.maxRightLean = absLeanAngle;
            $(".max-right-lean").text(absLeanAngle.toFixed(1));
        }
    }
};

/**
 * onCrashDetected
 * ---------------
 * Called when a crash has been detected.
 */
GuardianAngel.prototype.onCrashDetected = function() {
    try {
        if(this.crashDetected) {
            // We have already detected a crash, so we don't start
            // new timers etc...
            return;
        }

        this.crashDetected = true;
        Logger.log("Crash detected.");

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
        Logger.error(err.message);
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

        if(this.numberTextsRemaining === 0) {
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
        Logger.error(err.message);
    }
};

/**
 * sendTexts
 * ---------
 * Sends texts to the list of numbers specified in the settings, to say that we have crashed.
 */
GuardianAngel.prototype.sendTexts = function()  {
    var that = this;

    // We create the message to send, including the current location...
    var message = this.settings.crashMessage +
        " https://maps.google.com/maps?q=" +
        this.currentLatitude + "," + this.currentLongitude;

    // We parse the collection of numbers...
    var phoneNumbers = this.settings.phoneNumbers.split(",");
    for(var i=0; i<phoneNumbers.length; ++i) {
        var phoneNumber = phoneNumbers[i];
        Logger.log("Sending text to: " + phoneNumber + ". Message: " + message);

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
                that.log("SMS sent");
            },
            function() {
                // On error...
                that.error("SMS failed to send.");
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
    Logger.log("ERROR: " + text);
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
        Logger.error(err.message);
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

    // We reset the max and min ride-info...
    this.minMaxRideData = new MinMaxRideData();
    $(".max-left-lean").text("0.0");
    $(".max-right-lean").text("0.0");

    // We clear the collection of data for the ride...
    this.rideDatas = [];
    this.rideDatasIndex = 0;

    // We clear the crash detection page...
    this.clearCrashDetection();

    // We start measuring ride info, including lean and crash detection...
    this.rideDataCalculator.start();

    this.rideStarted = true;
};

/**
 * stopRide
 * --------
 * Stops monitoring a ride.
 */
GuardianAngel.prototype.stopRide = function() {
    this.rideStarted = false;

    // We stop measuring ride info (including lean and crash detection)...
    this.rideDataCalculator.stop();

    // We change the button to say "Start"..
    var startButtonElement = $("#start-button");
    startButtonElement.html('<i class="icon-play"></i> Press to start ride');
    startButtonElement.css("background-color", "red");

    // We show the ride map and move to the ride-info slide which shows it...
    this.showMap_DEPRECATED();
    this.swiper.slideTo(GuardianAngel.Slide.RIDE_INFO);
};

/**
 * showMap_DEPRECATED
 * -------
 * Displays a map showing the ride route, with lean and speed info.
 */
GuardianAngel.prototype.showMap_DEPRECATED = function() {
    var that = this;

    // We find the center of the map and create the map...
    var centerLatitude = (this.minMaxRideData.minLatitude + this.minMaxRideData.maxLatitude) / 2.0;
    var centerLongitude = (this.minMaxRideData.minLongitude + this.minMaxRideData.maxLongitude) / 2.0;
    var map = new GMaps({
        div: "#map",
        lat: centerLatitude,
        lng: centerLongitude,
        scaleControl: false,
        zoomControl: false,
        streetViewControl: false,
        panControl: false,
        click: function(e) {
            map.removeOverlays();
        },
        bounds_changed: function() {
            that.onMapBoundsChanged();
        }
    });

    // We find the type of map to show...
    var mapType = this.getSelectedMapType();

    // We draw lines from each point to the next, color coding it by lean-angle or speed...
    var points = this.rideDatas;
    //points = this.createTestPoints(); // TODO: Remove this!

    var numPoints = points.length;
    if(numPoints === 0) {
        // There are no points recorded, so there is nothing to show...
        return;
    }

    // We draw the lines...
    var numPointsPlotted = 0;
    var previousPoint = points[0];
    for(var i=1; i<numPoints; ++i) {
        var newPoint = points[i];
        if(!this.mapSignificantChange(previousPoint, newPoint) && i != numPoints-1) {
            // There has been no significant change from the previous point
            // (for example, the bike may be stopped), so we do not plot this
            // point...
            continue;
        }

        this.addLineToMap(map, previousPoint, newPoint, mapType);
        numPointsPlotted++;
        previousPoint = newPoint;
    }
    Logger.log("Showing map. Total points in ride: " + numPoints + ", points plotted: " + numPointsPlotted);

    // We scale and zoom to the route...
    if(numPointsPlotted > 1) {
        var bounds = [];
        bounds.push(new google.maps.LatLng(this.minMaxRideData.minLatitude, this.minMaxRideData.minLongitude));
        bounds.push(new google.maps.LatLng(this.minMaxRideData.maxLatitude, this.minMaxRideData.maxLongitude));
        map.fitLatLngBounds(bounds);
    }
};

/**
 * showMap
 * -------
 * Shows the ride route and information on a map.
 */
GuardianAngel.prototype.showMap = function() {
    var that = this;

    // We find the center of the map and create the map...
    var centerLatitude = (this.minMaxRideData.minLatitude + this.minMaxRideData.maxLatitude) / 2.0;
    var centerLongitude = (this.minMaxRideData.minLongitude + this.minMaxRideData.maxLongitude) / 2.0;
    this.map = new GMaps({
        div: "#map",
        lat: centerLatitude,
        lng: centerLongitude,
        scaleControl: false,
        zoomControl: false,
        streetViewControl: false,
        panControl: false,
        click: function(e) {
            map.removeOverlays();
        },
        bounds_changed: function() {
            that.onMapBoundsChanged();
        }
    });
};

/**
 * onMapBoundsChanged
 * ------------------
 * Called when the bounds of the map have changed, ie when it has been zoomed or moved.
 */
GuardianAngel.prototype.onMapBoundsChanged = function() {
    // We want to redraw the map, but only when zooming / moving has finished.
    // So we give it a short time before we redraw...
    var that = this;
    if(this.mapRedrawTimer !== null) {
        clearTimeout(timer);
    }
    this.mapRedrawTimer = setTimeout(function() {
        that.redrawMap();
    }, 500);
};

/**
 * redrawMap
 * ---------
 * Draws the ride route on the map.
 */
GuardianAngel.prototype.redrawMap = function() {
    // There may be a very large number of points in the route, and depending
    // on the scale of the map we may not want to draw all of them:
    //
    // - We do not want to show any points that are outside the bounds of the map.
    //
    // - When zoomed out, we draw a rough outline of the ride, getting more detailed
    //   as we zoom in.
    //
    // To do this, we always draw (roughly) the same number of lines regardless of
    // the zoom level. When zoomed out, this means that we draw an approximate line,
    // using aggregated information from a number of points in the ride.

    // We find the bounds of the map...
};



/**
 * getSelectedMapType
 * ------------------
 * Returns the map-type (lean or speed) selected in the map-options panel.
 */
GuardianAngel.prototype.getSelectedMapType = function() {
    var mapType = GuardianAngel.MapType.LEAN;
    var mapTypeString = this.getSetting("map-options-map-type", "radio");
    if(mapTypeString === "lean") {
        mapType = GuardianAngel.MapType.LEAN;
    }
    if(mapTypeString === "speed") {
        mapType = GuardianAngel.MapType.SPEED;
    }
    return mapType;
};

/**
 * mapSignificantChange
 * --------------------
 * Returns true if there has been a significant change between two points in the ride.
 */
GuardianAngel.prototype.mapSignificantChange = function(point1, point2) {
    // The change is significant if:
    // 1. The distance has changed by more than a limit, OR
    // 2. The lean angle has changed by more than a limit, OR
    // 3. The speed has changed by more than a limit.

    // 1. Distance.
    // We do a rough Pythagoras calculation, which should be good enough for this
    // significant change check.
    var diffLatitude = point2.latitude - point1.latitude;
    var diffLatitudeMeters = diffLatitude * this.metersPerDegreeOfLatitude;
    var diffLatitudeMetersSquared = diffLatitudeMeters * diffLatitudeMeters;

    var diffLongitude = point2.longitude - point1.longitude;
    var diffLongitudeMeters = diffLongitude * this.metersPerDegreeOfLongitude;
    var diffLongitudeMetersSquared = diffLongitudeMeters * diffLongitudeMeters;

    var distanceSquared = diffLatitudeMetersSquared + diffLongitudeMetersSquared;
    if(distanceSquared > this.mapSignificantDistanceMetersSquared) {
        return true;
    }

    // 2. Lean angle...
    var diffLean = Math.abs(point2.leanAngle - point1.leanAngle);
    if(diffLean > this.mapSignificantLeanDelta) {
        return true;
    }

    // 3. Speed...
    var diffSpeed = Math.abs(point2.speed - point1.speed);
    if(diffSpeed > this.mapSignificantSpeedDelta) {
        return true;
    }

    // None of the conditions had a significant change...
    return false;
};

/**
 * addLineToMap
 * ------------
 * Adds a line to the map, coloring it according to lean angle or speed.
 */
GuardianAngel.prototype.addLineToMap = function(map, startPoint, endPoint, mapType) {
    var midLatitude = (startPoint.latitude + endPoint.latitude) / 2.0;
    var midLongitude = (startPoint.longitude + endPoint.longitude) / 2.0;
    var speedInfo = this.convertSpeed(endPoint.speed);

    // We find the color as a percentage of the max speed or lean-angle
    // depending on the map type.
    var color = "#0000ff";
    if(mapType === GuardianAngel.MapType.LEAN) {
        color = this.getLeanColor(endPoint.leanAngle, this.minMaxRideData.maxLeftLean, this.minMaxRideData.maxRightLean);
    } else if(mapType === GuardianAngel.MapType.SPEED) {
        color = this.getSpeedColor(endPoint.speed, this.minMaxRideData.maxSpeed);
    }

    // We create a message to show when this line is clicked...
    var message = '<div class="map-overlay">' +
        '<div><span class="map-overlay-label">Speed:</span>' + speedInfo.speed.toFixed(0) + ' ' + speedInfo.units + '</div>' +
        '<div><span class="map-overlay-label">Lean:</span>' + endPoint.leanAngle.toFixed(1) + '&#176</div>' +
        '</div>';

    // We draw the line...
    map.drawPolyline({
        path: [[startPoint.latitude, startPoint.longitude], [endPoint.latitude, endPoint.longitude]],
        strokeColor: color,
        strokeOpacity: 0.6,
        strokeWeight: 5,
        click: function(e) {
            map.removeOverlays();
            map.drawOverlay({
                lat: midLatitude,
                lng: midLongitude,
                content: message,
                verticalAlign: 'top',
                horizontalAlign: 'center'
            });
        }
    });
};

/**
 * getLeanColor
 * ------------
 * Returns a color representing the lean angle.
 * 0 = blue, max-left = green, max-right = red
 */
GuardianAngel.prototype.getLeanColor = function(leanAngle, maxLeftLean, maxRightLean) {
    if(leanAngle === 0.0) return "#0000ff";

    // Is it a left or right lean?
    var fractionOfMax, red, green, blue;
    var absLeanAngle = Math.abs(leanAngle);
    if(leanAngle < 0.0) {
        // It's a left lean...
        if(maxLeftLean === 0.0) return "#0000ff";
        fractionOfMax = absLeanAngle / maxLeftLean;
        blue = 255 - 255 * fractionOfMax;
        green = 255 * fractionOfMax;
        return this.rgbToString(0, green, blue);
    } else {
        // It's a right lean...
        if(maxRightLean === 0.0) return "#0000ff";
        fractionOfMax = absLeanAngle / maxRightLean;
        blue = 255 - 255 * fractionOfMax;
        red = 255 * fractionOfMax;
        return this.rgbToString(red, 0, blue);
    }
};

/**
 * getSpeedColor
 * -------------
 * Returns a color representing the speed.
 * 0 = blue, max-speed = red.
 */
GuardianAngel.prototype.getSpeedColor = function(speed, maxSpeed) {
    if(maxSpeed === 0.0) {
        return "#0000ff";
    }

    var fractionOfMax = speed / maxSpeed;
    var blue = 255 - 255 * fractionOfMax;
    var red = 255 * fractionOfMax;
    return this.rgbToString(red, 0, blue);
};

// TODO: Remove this!
GuardianAngel.prototype.createTestPoints = function() {
    this.minMaxRideData = new MinMaxRideData();
    var points = [];
    var that = this;

    // Adds a point and updates the min and max values...
    function addPoint(point) {
        points.push(point);
        if(point.latitude > that.minMaxRideData.maxLatitude) that.minMaxRideData.maxLatitude = point.latitude;
        if(point.latitude < that.minMaxRideData.minLatitude) that.minMaxRideData.minLatitude = point.latitude;
        if(point.longitude > that.minMaxRideData.maxLongitude) that.minMaxRideData.maxLongitude = point.longitude;
        if(point.longitude < that.minMaxRideData.minLongitude) that.minMaxRideData.minLongitude = point.longitude;
        if(point.speed > that.minMaxRideData.maxSpeed) that.minMaxRideData.maxSpeed = point.speed;
        var absLean = Math.abs(point.leanAngle);
        if(point.leanAngle < 0.0) {
            if(absLean > that.minMaxRideData.maxLeftLean) {
                that.minMaxRideData.maxLeftLean = absLean;
            }
        } else {
            if(absLean > that.minMaxRideData.maxRightLean) {
                that.minMaxRideData.maxRightLean = absLean;
            }
        }
    }

    addPoint({
        latitude: 54.203124,
        longitude: -4.629437,
        leanAngle: 0,
        speed: 0
    });
    addPoint({
        latitude: 54.205399,
        longitude: -4.629420,
        leanAngle: 10.8,
        speed: 10
    });
    addPoint({
        latitude: 54.207422,
        longitude: -4.630825,
        leanAngle: 1.3,
        speed: 30
    });
    addPoint({
        latitude: 54.210314,
        longitude: -4.630358,
        leanAngle: -12.1,
        speed: 40
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6301,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6304,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6307,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6310,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6313,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6316,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6319,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6322,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6325,
        leanAngle: -17.5,
        speed: 28
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6328,
        leanAngle: -17.5,
        speed: 25
    });
    addPoint({
        latitude: 54.211475,
        longitude: -4.6331,
        leanAngle: -17.5,
        speed: 25
    });

    //var lat = 54.211475;
    //var lng = -4.6331;
    //var speed = 25;
    //var lean = -17.5;
    //for(var i=0; i<50000; ++i) {
    //    var newLat = lat + Math.random() * 0.0001 - 0.00005;
    //    var newLng = lng + Math.random() * 0.0001 - 0.00005;
    //    var newSpeed = speed + Math.random() * 1.0 - 0.5;
    //    if(newSpeed < 0.0) newSpeed = 0.0;
    //    var newLean = lean + Math.random() * 1.0 - 0.5;
    //    if(newLean < -30) newLean = -30;
    //    if(newLean > 30) newLean = 30;
    //
    //    addPoint({
    //        latitude: newLat,
    //        longitude: newLng,
    //        leanAngle: newLean,
    //        speed: newSpeed
    //    });
    //    lat = newLat;
    //    lng = newLng;
    //    speed = newSpeed;
    //    lean = newLean;
    //}

    return points;
};

// TODO: Write this, and optimization to exclude points.
GuardianAngel.prototype.getLongitudeMetersPerDegree = function(latitude) {

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
    this.crashDetected = false;
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
    Logger.log("Loading settings.");

    // We load the fields in the settings...
    for(var field in this.settings) {
        var defaultValue = this.settings[field];
        var defaultValueType = typeof(defaultValue);

        // We try to load the setting...
        var storedValue = localStorage.getItem(field);
        if(storedValue === null) {
            // The data is not stored, so we store the default...
            localStorage.setItem(field, String(defaultValue));
            Logger.log("Storing default value for settings field: " + field + "=" + defaultValue);
        } else {
            // The data is stored, so we use it - first converting it...
            if(defaultValueType === "string") {
                this.settings[field] = storedValue;
            } else if(defaultValueType === "number"){
                this.settings[field] = Number(storedValue);
            } else {
                Logger.error("Could not convert type for settings field: " + field);
                continue;
            }
            Logger.log("Loaded settings field: " + field + "=" + this.settings[field]);
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
 * findPlatform
 * ------------
 * We check which device we are running on. In particular we note if we are on
 * Android, as paths to sound files need to be treated differently.
 */
GuardianAngel.prototype.findPlatform = function() {
    var platform = navigator.userAgent;
    Logger.log("Platform: " + platform);

    this.isAndroid = platform.toUpperCase().indexOf("ANDROID") > -1;
    this.isWindows = platform.toUpperCase().indexOf("WINDOWS NT") > -1;
    Logger.log("isAndroid: " + this.isAndroid);
    Logger.log("isWindows: " + this.isWindows);
};

/**
 * playAlertSound
 * --------------
 * Plays the alert sound on a loop.
 */
GuardianAngel.prototype.playAlertSound = function() {
    Logger.log("Playing alert sound.");

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
        this.rideDataCalculator.setAlertAngle(this.settings.crashLeanAngle);
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

    Logger.error("Failed to read setting: " + name + ". Requested type: " + type);
};

/**
 * rgbToString
 * -----------
 * Converts RGB values to a color string.
 */
GuardianAngel.prototype.rgbToString = function(r, g, b) {
    function componentToHex(c) {
        var hex = c.toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    }
    r = Math.round(r);
    g = Math.round(g);
    b = Math.round(b);
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

/**
 * setupMapOptionsPanel
 * --------------------
 * Sets up the options panel that is shown as an overlay on the map.
 */
GuardianAngel.prototype.setupMapOptionsPanel = function() {
    this.showMap_DEPRECATED();  // TODO: Remove this
    this.swiper.slideTo(GuardianAngel.Slide.RIDE_INFO);  // TODO: Remove this

    var that = this;

    // Event called when the lean / speed radio buttons are clicked.
    // We show the chosen map-type...
    $(".map-lean-or-speed").click(function(e) {
        that.showMap_DEPRECATED();
    });
};
