/**
 * LastDrawnPointInfo
 * ------------------
 * Holds information about the last (previous) point drawn on the ride-info map,
 * along with data for undrawn points seen since this point.
 */
function LastDrawnPointInfo(rideDataPoint) {
    this.latitude = rideDataPoint.latitude;
    this.longitude = rideDataPoint.longitude;
    this.distance = 0.0;
    this.maxLeftLeanAngle = 0.0;
    this.maxRightLeanAngle = 0.0;
    this.maxSpeed = 0.0;
    this.updateMaxValues(rideDataPoint.speed, rideDataPoint.leanAngle);
}

/**
 * updateMaxValues
 * ---------------
 */
LastDrawnPointInfo.prototype.updateMaxValues = function(speed, leanAngle) {
    if(speed > this.maxSpeed) this.maxSpeed = speed;
    var absLeanAngle = Math.abs(leanAngle);
    if(leanAngle < 0.0 && absLeanAngle > this.maxLeftLeanAngle) this.maxLeftLeanAngle = absLeanAngle;
    if(leanAngle > 0.0 && absLeanAngle > this.maxRightLeanAngle) this.maxRightLeanAngle = absLeanAngle;
};

/**
 * getSpeed
 * --------
 */
LastDrawnPointInfo.prototype.getSpeed = function() {
    return this.maxSpeed;
};

/**
 * getLeanAngle
 * ------------
 */
LastDrawnPointInfo.prototype.getLeanAngle = function() {
    if(this.maxRightLeanAngle > this.maxLeftLeanAngle) {
        return this.maxRightLeanAngle;
    } else {
        return -1.0 * this.maxLeftLeanAngle;
    }
};


/**
 * MapUtils
 * --------
 * Static helper functions for drawing a route on a map.
 */
function MapUtils() {
}

/**
 * addLineToMap
 * ------------
 * Adds a line to the map, coloring it according to lean angle or speed.
 */
MapUtils.addLineToMap = function(map, startLatitude, startLongitude, endLatitude, endLongitude, speed, leanAngle, mapType) {
    var midLatitude = (startLatitude + endLatitude) / 2.0;
    var midLongitude = (startLongitude + endLongitude) / 2.0;
    var speedInfo = this.convertSpeed(speed);

    // We find the color as a percentage of the max speed or lean-angle
    // depending on the map type.
    var color = "#0000ff";
    if(mapType === GuardianAngel.MapType.LEAN) {
        color = MapUtils.getLeanColor(leanAngle, this.minMaxRideData.maxLeftLean, this.minMaxRideData.maxRightLean);
    } else if(mapType === GuardianAngel.MapType.SPEED) {
        color = MapUtils.getSpeedColor(speed, this.minMaxRideData.maxSpeed);
    }

    // We create a message to show when this line is clicked...
    var message = '<div class="map-overlay">' +
        '<div><span class="map-overlay-label">Speed:</span>' + speedInfo.speed.toFixed(0) + ' ' + speedInfo.units + '</div>' +
        '<div><span class="map-overlay-label">Lean:</span>' + leanAngle.toFixed(1) + '&#176</div>' +
        '</div>';

    // We draw the line...
    map.drawPolyline({
        path: [[startLatitude, startLongitude], [endLatitude, endLongitude]],
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
MapUtils.getLeanColor = function(leanAngle, maxLeftLean, maxRightLean) {
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
        return MapUtils.rgbToString(0, green, blue);
    } else {
        // It's a right lean...
        if(maxRightLean === 0.0) return "#0000ff";
        fractionOfMax = absLeanAngle / maxRightLean;
        blue = 255 - 255 * fractionOfMax;
        red = 255 * fractionOfMax;
        return MapUtils.rgbToString(red, 0, blue);
    }
};

/**
 * getSpeedColor
 * -------------
 * Returns a color representing the speed.
 * 0 = blue, max-speed = red.
 */
MapUtils.getSpeedColor = function(speed, maxSpeed) {
    if(maxSpeed === 0.0) {
        return "#0000ff";
    }

    var fractionOfMax = speed / maxSpeed;
    var blue = 255 - 255 * fractionOfMax;
    var red = 255 * fractionOfMax;
    return MapUtils.rgbToString(red, 0, blue);
};

/**
 * rgbToString
 * -----------
 * Converts RGB values to a color string.
 */
MapUtils.rgbToString = function(r, g, b) {
    function componentToHex(c) {
        var hex = c.toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    }
    r = Math.round(r);
    g = Math.round(g);
    b = Math.round(b);
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};
