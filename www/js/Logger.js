/**
 * Logger
 * ------
 * Class with static methods for logging.
 */

/**
 *
 * @constructor
 */
function Logger() {
}

/**
 * log
 * ---
 * Logs an info message.
 */
Logger.log = function(text) {
    // We add the date/time to the message...
    var message = new Date().toLocaleTimeString() + ": " + text;

    var newElement = $("<div></div>");
    newElement.addClass("log-line").html(message);
    $("#log").prepend(newElement);
};

/**
 * error
 * -----
 * Logs an error message.
 */
Logger.error = function(text) {
    Logger.log("ERROR: " + text);
};

