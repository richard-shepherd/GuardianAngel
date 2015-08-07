/**
 * LeanCalculator
 * --------------
 * Provides the lean angle of the phone, smoothing it against 'bounce'
 * using a moving average.
 */

/**
 * @constructor
 *
 * @param params
 * Overrides for the default params. See the params object below.
 * 'callback' is function(smoothedValue), where smoothedValue is a float.
 * 'alertCallback' is function()
 */
function LeanCalculator(params) {
    // Default params, which can be overridden optionally by the params passed in...
    this._params = {
        // The callbacks...
        callback: null,
        alertCallback: null,

        // We take lean samples at this interval...
        sampleSpeedMS: 50,

        // Number of samples over which we perform a moving average (if the samples are volatile)...
        numberSamples: 14,

        // Raise the alert callback if this angle is exceeded...
        alertAngle: 60.0,

        // Raise the alert callback if the alertAngle has been exceeded for this length of time...
        alertAfterSeconds: 5.0,

        // We may not call back on every sample...
        callbackEveryNSamples: 1
    };
    this.mergeParams(params);

    // We callback every N samples. This keeps count...
    this._callbackSampleCount = 0;

    // We hold the most recent raw lean angle...
    this._rawLeanAngle = 0.0;

    // A timer which runs when the lean angle goes over the limit.
    // If it is over the limit for the timeout, we consider there to
    // have been a crash...
    this._alertTimeoutTimer = null;

    // The array of recent samples. This is really more like a
    // circular buffer, with sampleIndex pointing to the current
    // position to insert data...
    this._samples = [];
    this._sampleIndex = 0;
    for(var i=0; i<this._params.numberSamples; ++i) {
        this._samples.push(0.0);
    }

    // We subscribe to the phone's orientation...
    var that = this;
    window.addEventListener('deviceorientation', function(eventData) {
        that.onDeviceOrientation(eventData);
    });

    // We run a timer to sample the lean angle and produce the moving average...
    window.setInterval(function() {
        that.onTimer();
    }, this._params.sampleSpeedMS);
}

/**
 * mergeParams
 * -----------
 * Merges the dictionary of params passed in, into the ones we will use.
 * This allows you to optionally override the default params.
 */
LeanCalculator.prototype.mergeParams = function(params) {
    if(typeof(params) === 'undefined') {
        return;
    }
    for(var item in params) {
        if(params.hasOwnProperty(item)) {
            this._params[item] = params[item];
        }
    }
};


/**
 * onDeviceOrientation
 * -------------------
 * Called when we get an update to the orientation.
 * We just store it, so that it can be sampled by a timer.
 */
LeanCalculator.prototype.onDeviceOrientation = function(eventData) {
    this._rawLeanAngle = eventData.beta;
};

/**
 * onTimer
 * -------
 * Called on the sample timer. We calculate the current value of the moving
 * average, including the latest sample of the lean angle.
 */
LeanCalculator.prototype.onTimer = function() {
    var numberSamples = this._params.numberSamples;

    // We add the current sample to the collection and find the next index...
    this._samples[this._sampleIndex] = this._rawLeanAngle;
    this._sampleIndex++;
    if(this._sampleIndex >= numberSamples) {
        this._sampleIndex = 0;
    }

    // We calculate the moving average...
    var total = 0.0;
    for(var i=0; i<numberSamples; ++i) {
        total += this._samples[i];
    }
    var leanAngle = total / numberSamples;

    // We check for a crash...
    this.checkForCrash(leanAngle);

    // And call back...
    this._callbackSampleCount++;
    if(this._callbackSampleCount >= this._params.callbackEveryNSamples) {
        this._params.callback(leanAngle);
        this._callbackSampleCount = 0;
    }
};

/**
 * checkForCrash
 * -------------
 * We check if the angle is greater than the "crash" limit.
 */
LeanCalculator.prototype.checkForCrash = function(leanAngle) {
    if(leanAngle > this._params.alertAngle && this._alertTimeoutTimer === null) {
        // The angle has gone over the limit, and the timer is not running,
        // so we start it...
        var that = this;
        this._alertTimeoutTimer = setTimeout(function() {
            // The angle has been over the limit for the timeout, so we
            // raise the alert...
            that._params.alertCallback();
        }, this._params.alertAfterSeconds * 1000);
    } else if(leanAngle <= this._params.alertAngle && this._alertTimeoutTimer !== null) {
        // The lean angle is less than the alert limit, and the timer is running.
        // It looks like the alert may have been a blip...
        clearTimeout(this._alertTimeoutTimer);
        this._alertTimeoutTimer = null;
    }
};

