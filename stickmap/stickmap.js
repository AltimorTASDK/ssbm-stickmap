"use strict";

const DEADZONE = 22;

// Minimum framerate to maintain while redrawing canvas
const MINIMUM_FRAMERATE = 255;

const GATE_RADIUS = 103; // Unclamped range
const CLAMP_RADIUS = 80; // Clamped range

// How much to darken clamped coordinates
const CLAMPED_COLOR_MULT = 1.0 / 3.0;

const GRID_LINE_WIDTH = 1;
const CANVAS_SCALE = 6;
const MIN_CANVAS_SCALE = 0.5;

// Minimum body scale for small windows
const MIN_SCALE = 0.6;

// Minimum mouse movement to start dragging a region
const MIN_DRAG_DISTANCE = 2.0; // em

// Minimum region drag distance from top/bottom before auto scrolling starts
const AUTO_SCROLL_DISTANCE = 2.0; // em

const DisplayMode = {
    Normal: 0,
    Outline: 1,
    RimOnly: 2
};

let loading = true;

let showingJson = false;

let useGate = true;

let regions = [];
let template = null;
let canvas = null;

let canvasImageSize;

// Saved between partial canvas draws
let drawX = 0;
let drawY = 0;

class Region
{
    name = `Region ${regions.length + 1}`;

    color = [255, 255, 255, 255];
    quadrants = [false, false, false, false];
    displayMode = DisplayMode.Normal;
    minX = 0;
    minY = 0;
    maxX = CLAMP_RADIUS;
    maxY = CLAMP_RADIUS;
    angleMin = 0;
    angleMax = 90;
    magnitudeMin = 0;
    magnitudeMax = CLAMP_RADIUS;

    #element = template.clone();

    #clicked = false;
    #dragging = false;
    #dragStart = 0;
    #dragOffset = 0;

    #scrolling = false;
    #scrollDistance = 0.0;

    #deleting = false;

    #contentHeight;

    get colorHex() { return this.color.map(x => x.toString(16).padStart(2, "0")).join(""); }

    get outerHeight() { return this.#element.outerHeight(); }

    constructor(properties={})
    {
        for (const key of Object.keys(properties).filter(key => key in this))
            this[key] = properties[key];

        this.#updateUI();

        this.#element.prependTo("#region-list");

        let region = this;

        function moveDragPositionBar(index, interpolate=true)
        {
            let top = 0;

            for (let i = regions.length - 1; i > index; i--)
                top += regions[i].#element.outerHeight();

            let bar = $("#drag-position-bar");
            bar.stop();

            if (!interpolate) {
                bar.css("top", top);
                bar.animate({opacity: 1.0}, {queue: false});
                return;
            }

            bar.animate({opacity: 0.0}, 200, () => {
                bar.css("top", top);
                bar.animate({opacity: 1.0}, 200);
            });
        }

        function lockRegionListHeight()
        {
                let height = 0;
                for (let region of regions)
                    height += region.#element.outerHeight();

                let userInput = $("#user-input");
                let regionList = $("#region-list");
                let offset = regionList.offset().top - userInput.offset().top;
                let minHeight = userInput.innerHeight() - offset;
                regionList.css("height", Math.max(height, minHeight));
                regionList.css("overflow", "hidden");
                userInput.css("padding-bottom", 0);
        }

        function unlockRegionListHeight()
        {
                let regionList = $("#region-list");
                regionList.css("height", "auto");
                regionList.css("overflow", "visible");
                $("#userInput").css("padding-bottom", "initial");
        }

        function updateRegionOrder(mouseY)
        {
            for (let i = 0; i < regions.length; i++) {
                if (regions[i] == region)
                    continue;

                let otherElem = regions[i].#element;
                let otherTop = otherElem.offset().top;
                let otherBottom = otherTop + otherElem.outerHeight();
                let otherCenter = (otherTop + otherBottom) / 2;

                if (mouseY > otherCenter) {
                    if (mouseY > otherBottom && i != 0)
                        continue;

                    if (regions.indexOf(region) == i - 1)
                        return;

                    regions.splice(regions.indexOf(region), 1);
                    regions.splice(i, 0, region);
                    moveDragPositionBar(i);
                    repositionRegions(region);
                    drawStickMap();
                } else {
                    if (mouseY < otherTop && i != regions.length - 1)
                        continue;

                    if (regions.indexOf(region) == i + 1)
                        return;

                    regions.splice(regions.indexOf(region), 1);
                    regions.splice(i + 1, 0, region);
                    moveDragPositionBar(i + 1);
                    repositionRegions(region);
                    drawStickMap();
                }

                return;
            }
        }

        // Mouse dragging
        $(document).mousemove(function(event) {
            if (!region.#clicked)
                return;

            let elem = region.#element;
            let minDragDistance = emToPixels($("body"), MIN_DRAG_DISTANCE);

            if (!region.#dragging && Math.abs(event.pageY - region.#dragStart) > minDragDistance) {
                region.#dragging = true;

                lockRegionListHeight();

                elem.css("z-index", 100);
                elem.animate({opacity: 0.5});
                elem.css({height: elem.height()});

                let regionContent = elem.find(".region-content");
                region.#contentHeight = regionContent.height();
                regionContent.animate({height: 0}, {queue: false, duration: 200});

                moveDragPositionBar(regions.indexOf(region), false);
                repositionRegions(region);
            }

            if (!region.#dragging)
                return;

            // Auto scroll
            let userInput = $("#user-input");
            let regionList = $("#region-list");
            let regionHeader = elem.find(".region-header");
            let autoScrollDistance = emToPixels($("body"), AUTO_SCROLL_DISTANCE);

            let autoScroll = () => {
                if (!region.#dragging || !region.#scrolling)
                    return;

                let scrollSpeed;
                let distance = region.#scrollDistance;
                let top = -regionList.offset().top;

                if (distance > 0) {
                    scrollSpeed = Math.min(distance, autoScrollDistance);
                    top += scrollSpeed * 2 - autoScrollDistance;
                    top += userInput.innerHeight() - regionHeader.height();
                } else {
                    scrollSpeed = Math.max(distance, -autoScrollDistance);
                    top += scrollSpeed * 2 + autoScrollDistance;
                }

                let topMax = regionList.innerHeight() - regionHeader.height();
                elem.animate({top: Math.min(Math.max(top, 0), topMax)}, {
                    duration: 20,
                    easing: "linear"
                });

                let parentTop = elem.parent().offset().top;
                let mouseY = top + parentTop + region.#dragOffset;

                userInput.animate({scrollTop: "+=" + scrollSpeed}, {
                    duration: 20,
                    easing: "linear",
                    complete: () => {
                        updateRegionOrder(mouseY);
                        autoScroll();
                    }
                });
            }

            let scrollAreaTop = userInput.offset().top;
            let scrollAreaBottom = scrollAreaTop + userInput.innerHeight();
            let headerTop = event.pageY - region.#dragOffset;
            let headerBottom = headerTop + regionHeader.height();
            let distanceTop = Math.min(scrollAreaTop - headerTop, 0);
            let distanceBottom = Math.min(headerBottom - scrollAreaBottom, 0);

            if (distanceTop > -autoScrollDistance) {
                region.#scrollDistance = -distanceTop - autoScrollDistance;
            } else if (distanceBottom > -autoScrollDistance) {
                region.#scrollDistance = distanceBottom + autoScrollDistance;
            } else {
                let parentTop = elem.parent().offset().top;
                let top = event.pageY - parentTop - region.#dragOffset;
                let topMax = userInput.height() - regionList.offset().top;
                elem.css("top", Math.min(Math.max(top, 0), topMax));

                if (region.#scrolling) {
                    region.#scrolling = false;
                    region.#scrollDistance = 0.0;
                    userInput.stop();
                }
            }

            if (!region.#scrolling && region.#scrollDistance != 0.0) {
                region.#scrolling = true;
                autoScroll();
            }

            updateRegionOrder(event.pageY);
        });

        $(document).mouseup(function(event) {
            if (!region.#clicked)
                return;

            setTimeout(() => {
                unlockRegionListHeight();
                region.#element.css("z-index", "auto");
            }, 400);

            repositionRegions();

            region.#element.css("height", "auto");
            region.#element.animate({opacity: 1.0}, {queue: false});

            $("body").css("user-select", "initial");

            let bar = $("#drag-position-bar");
            bar.stop();
            bar.animate({opacity: 0.0});

            let regionContent = region.#element.find(".region-content");
            regionContent.animate({height: region.#contentHeight}, {
                duration: 200,
                queue: false,
                complete: () => regionContent.css("height", "auto")
            });

            region.#clicked = false;
            region.#dragging = false;
        });

        this.#element.find(".drag-handle").mousedown(function(event) {
            region.#dragStart = event.pageY;
            region.#dragOffset = event.pageY - region.#element.offset().top;
            region.#clicked = true;
            region.#scrolling = false;
            $("body").css("user-select", "none");
        });

        // Delete button
        this.#element.find(".delete-button").click(function() {
            if (region.#deleting)
                return;

            region.#deleting = true;

            regions.splice(regions.indexOf(region), 1);
            repositionRegions();
            drawStickMap();

            region.#element.animate({height: 0}, {
                queue: false,
                complete: () => region.#element.remove()
            });
        });

        // Move up button
        this.#element.find(".move-button-up").click(function() {
            let index = regions.indexOf(region);
            if (index == regions.length - 1)
                return;

            regions[index] = regions[index + 1];
            regions[index + 1] = region;

            lockRegionListHeight();
            repositionRegions();
            drawStickMap();

            region.#element.css("z-index", "50");
            setTimeout(() => {
                unlockRegionListHeight();
                region.#element.css("z-index", "auto");
            }, 400);
        });

        // Move down button
        this.#element.find(".move-button-down").click(function() {
            let index = regions.indexOf(region);
            if (index == 0)
                return;

            regions[index] = regions[index - 1];
            regions[index - 1] = region;

            lockRegionListHeight();
            repositionRegions();
            drawStickMap();

            region.#element.css("z-index", "50");
            setTimeout(() => {
                unlockRegionListHeight();
                region.#element.css("z-index", "auto");
            }, 400);
        });

        // Name input
        this.#element.find("#region-name").on("input", function() {
            region.name = this.value;
        });

        // Color input
        this.#element.find("#color-picker").change(function() {
            region.color = [...parseColorHex(this.value), region.color[3]];
            region.#updateColorSquare();
            region.#updateColorHex();
            drawStickMap();
        });

        this.#element.find(`#color-hex`).on("input", function() {
            region.color = filterColorHex(this);
            region.#updateColorSquare();
            region.#updateColorPicker();
            drawStickMap();
        });

        // Quadrant selection
        for (let i = 0; i < 4; i++) {
            this.#element.find(`#quadrant${i + 1}`).change(function() {
                region.quadrants[i] = this.checked;
                drawStickMap();
            });
        }

        // Display mode
        this.#element.find("#display-mode").change(function() {
            region.#changeProperty('displayMode', this.value);
        });

        // Coordinate input
        this.#element.find("#x-min").on("input", function() {
            region.#changeProperty('minX', filterCoord(this));
        });

        this.#element.find("#x-max").on("input", function() {
            region.#changeProperty('maxX', filterCoord(this));
        });

        this.#element.find("#y-min").on("input", function() {
            region.#changeProperty('minY', filterCoord(this));
        });

        this.#element.find("#y-max").on("input", function() {
            region.#changeProperty('maxY', filterCoord(this));
        });

        this.#element.find("#x-min").change(function() { roundCoord(this); });
        this.#element.find("#x-max").change(function() { roundCoord(this); });
        this.#element.find("#y-min").change(function() { roundCoord(this); });
        this.#element.find("#y-max").change(function() { roundCoord(this); });
        this.#element.find("#magnitude-min").change(function() { roundCoord(this); });
        this.#element.find("#magnitude-max").change(function() { roundCoord(this); });

        // Angle input
        this.#element.find("#angle-min").on("input", function() {
            region.#changeProperty('angleMin', filterAngle(this));
        });

        this.#element.find("#angle-max").on("input", function() {
            region.#changeProperty('angleMax', filterAngle(this));
        });

        // Magnitude input
        this.#element.find("#magnitude-min").on("input", function() {
            region.#changeProperty('magnitudeMin', filterCoord(this));
        });

        this.#element.find("#magnitude-max").on("input", function() {
            region.#changeProperty('magnitudeMax', filterCoord(this));
        });
    }

    moveTo(top, interpolate=true)
    {
        if (interpolate)
            this.#element.animate({top: top}, {queue: false});
        else
            this.#element.css("top", top);
    }

    matchesCoordinate(x, y)
    {
        if (this.displayMode == DisplayMode.RimOnly && !isRimCoordinate(x, y))
            return false;

        if (this.displayMode == DisplayMode.Outline &&
            this.#containsCoordinate(x + 1, y    ) &&
            this.#containsCoordinate(x + 1, y + 1) &&
            this.#containsCoordinate(x,     y + 1) &&
            this.#containsCoordinate(x - 1, y + 1) &&
            this.#containsCoordinate(x - 1, y    ) &&
            this.#containsCoordinate(x - 1, y - 1) &&
            this.#containsCoordinate(x,     y - 1) &&
            this.#containsCoordinate(x + 1, y - 1)) {
            return false;
        }

        return this.#containsCoordinate(x, y);
    }


    #matchesQuadrants(x, y)
    {
        let quadrants = this.quadrants;

        if (!quadrants[0] && !quadrants[1] && !quadrants[2] && !quadrants[3])
            return false;

        if (x > 0 && !quadrants[0] && !quadrants[3])
            return false;

        if (x < 0 && !quadrants[1] && !quadrants[2])
            return false;

        if (y > 0 && !quadrants[0] && !quadrants[1])
            return false;

        if (y < 0 && !quadrants[2] && !quadrants[3])
            return false;

        if (x > 0 && y > 0 && !quadrants[0])
            return false;

        if (x < 0 && y > 0 && !quadrants[1])
            return false;

        if (x < 0 && y < 0 && !quadrants[2])
            return false;

        if (x > 0 && y < 0 && !quadrants[3])
            return false;

        return true;
    }

    #angleDifference(x, y, angle)
    {
        return Math.abs(Math.atan(Math.abs(y) / Math.abs(x)) * 180 / Math.PI - angle);
    }

    #magnitudeDifference(x, y, magnitude)
    {
        return Math.abs(Math.sqrt(x**2 + y**2) - magnitude);
    }

    #containsCoordinate(x, y)
    {
        if (!isValidCoordinate(x, y))
            return false;

        // Check quadrant
        if (!this.#matchesQuadrants(x, y))
            return false;

        let absX = Math.abs(x);
        let absY = Math.abs(y);
        let roundedX = absX > DEADZONE ? absX : 0;
        let roundedY = absY > DEADZONE ? absY : 0;

        // Check bounds
        if (absX < this.minX || absX > this.maxX)
            return false;

        if (absY < this.minY || absY > this.maxY)
            return false;

        if (this.angleMin == this.angleMax && roundedX != 0 && roundedY != 0) {
            // Show line of closest matches to angle
            let angleDiff = this.#angleDifference(x, y, this.angleMin);

            if (this.angleMin >= 45) {
                if (angleDiff > this.#angleDifference(x + 1, y, this.angleMin))
                    return false;
                if (angleDiff > this.#angleDifference(x - 1, y, this.angleMin))
                    return false;
            }

            if (this.angleMin <= 45) {
                if (angleDiff > this.#angleDifference(x, y + 1, this.angleMin))
                    return false;
                if (angleDiff > this.#angleDifference(x, y - 1, this.angleMin))
                    return false;
            }
        } else {
            // Check angle
            let angle = Math.atan(roundedY / roundedX) * 180 / Math.PI;
            if (angle < this.angleMin || angle > this.angleMax)
                return false;
        }

        if (this.magnitudeMin == this.magnitudeMax) {
            // Show circle of closest matches to magnitude
            let magnitudeDiff = this.#magnitudeDifference(x, y, this.magnitudeMin);

            if (absX >= absY) {
                if (magnitudeDiff > this.#magnitudeDifference(x + 1, y, this.magnitudeMin))
                    return false;
                if (magnitudeDiff > this.#magnitudeDifference(x - 1, y, this.magnitudeMin))
                    return false;
            }

            if (absY >= absX) {
                if (magnitudeDiff > this.#magnitudeDifference(x, y + 1, this.magnitudeMin))
                    return false;
                if (magnitudeDiff > this.#magnitudeDifference(x, y - 1, this.magnitudeMin))
                    return false;
            }
        } else {
            let magnitude = Math.sqrt(roundedX**2 + roundedY**2);
            if (magnitude < this.magnitudeMin || magnitude > this.magnitudeMax)
                return false;
        }

        return true;
    }

    #changeProperty(property, value)
    {
        if (value !== this[property]) {
            this[property] = value;
            drawStickMap();
        }
    }

    #updateUI()
    {
        const formatCoord = coord => (coord / CLAMP_RADIUS).toFixed(4);
        const formatAngle = angle => angle.toFixed(2);

        this.#element.find("#region-name").val(this.name);
        this.#updateColorSquare();
        this.#updateColorPicker();
        this.#updateColorHex();
        this.quadrants.forEach((v, i) => this.#element.find(`#quadrant${i + 1}`).val(v));
        this.#element.find("#display-mode").val(this.displayMode);
        this.#element.find("#x-min").val(formatCoord(this.minX));
        this.#element.find("#x-max").val(formatCoord(this.maxX));
        this.#element.find("#y-min").val(formatCoord(this.minY));
        this.#element.find("#y-max").val(formatCoord(this.maxY));
        this.#element.find("#angle-min").val(formatAngle(this.angleMin));
        this.#element.find("#angle-max").val(formatAngle(this.angleMax));
        this.#element.find("#magnitude-min").val(formatCoord(this.magnitudeMin));
        this.#element.find("#magnitude-max").val(formatCoord(this.magnitudeMax));
    }

    #updateColorSquare()
    {
        const rgbStyle  = "#" + this.colorHex.slice(0, 6);
        const rgbaStyle = "#" + this.colorHex;
        this.#element.find("#color-square-left").css("background-color", rgbStyle);
        this.#element.find("#color-square-right").css("background-color", rgbaStyle);
    }

    #updateColorPicker()
    {
        this.#element.find("#color-picker").val("#" + this.colorHex.slice(0, 6));
    }

    #updateColorHex()
    {
        this.#element.find("#color-hex").val(this.colorHex);
    }
}

function roundCoord(elem)
{
    let selectionStart = elem.selectionStart;
    let selectionEnd = elem.selectionEnd;
    elem.value = (Math.round(parseFloat(elem.value) * CLAMP_RADIUS) / CLAMP_RADIUS).toFixed(4);
    elem.selectionStart = selectionStart;
    elem.selectionEnd = selectionEnd;
}

function parseColorHex(string)
{
    if (string.startsWith("#"))
        string = string.slice(1);

    return string.match(/../g).map(octet => parseInt(octet, 16));
}

function parseReplacementString(match, replacement)
{
    return replacement.replaceAll(
        /\$(?:((\d)?\d)|<([^>]*)>|([&`'$]))/g,
        (substring, groupNum, groupDigit, groupName, symbol) => {
            if (groupNum && groupNum in match)
                return match[groupNum];
            if (groupDigit && groupDigit in match)
                return match[groupDigit];
            if (groupName !== undefined && match.groups)
                return match.groups[groupName] ?? "";

            switch (symbol) {
            case "$": return "$";
            case "&": return match[0];
            case "`": return match.input.slice(0, match.index);
            case "'": return match.input.slice(match.index + match[0].length);
            default:  return substring;
            }
        });
}

function filterElemValue(elem, ...filters) {
    let selectionStart = elem.selectionStart;
    let selectionEnd = elem.selectionEnd;

    for (const [pattern, replacement] of filters) {
        let totalLengthChange = 0;
        const globalPattern = new RegExp(pattern, pattern.flags.replaceAll(/[dg]/g, "") + "dg");
        const caretIndex = selectionStart;

        for (const match of elem.value.matchAll(globalPattern)) {
            // Allow patterns to check the caret position with a named capture group
            if ((match.indices.groups?.caret?.[0] ?? caretIndex) != caretIndex)
                continue;

            // Adjust match index for previous replacements
            match.index += totalLengthChange;

            const matchStart = match.index;
            const matchLength = match[0].length;
            const matchEnd = matchStart + matchLength;

            const parsedReplacement = parseReplacementString(match, replacement);
            const replaceEnd = matchStart + parsedReplacement.length;
            const lengthChange = replaceEnd - matchEnd;

            if (matchLength != 0) {
                if (selectionStart >= matchEnd)
                    selectionStart += lengthChange;
                else if (selectionStart >= matchStart)
                    selectionStart = replaceEnd;

                if (selectionEnd >= matchEnd)
                    selectionEnd += lengthChange;
                else if (selectionEnd >= matchStart)
                    selectionEnd = replaceEnd;
            }

            elem.value = splicedString(elem.value, matchStart, matchLength, parsedReplacement);
            totalLengthChange += lengthChange;

            if (!pattern.global)
                break;
        }
    }

    elem.selectionStart = selectionStart;
    elem.selectionEnd = selectionEnd;
}

function filterColorHex(elem)
{
    filterElemValue(elem,
        [/[^\da-fA-F]/g,                 ""],         // Remove invalid characters
        [/(?<caret>).(?=.*$(?<=.{8}))/g, ""],         // Replace digit when over 8 digits
        [/(?<caret>)(?=.*$(?<!.{8}))/g,  "0"],        // Insert 0 when backspacing
        [/$(?<!.{8})/,                   "00000000"], // Ensure 8 digits
        [/(?<=.{8,}).+$/,                ""]);        // Truncate to 8 digits

    return parseColorHex(elem.value);
}

function filterCoord(elem)
{
    filterElemValue(elem,
        [/[^\d.]/g,                       ""],     // Remove invalid characters
        [/(?<=^\d)(\d)(?<caret>)\./,      ".$1"],  // Automatically type digits after decimal
        [/(?<=^\d)(?<caret>)\d(?=\.)/,    ""],     // Type over ones digit
        [/^(\d{0,4}$)/,                   "0.$1"], // Automatically prepend decimal
        [/(?<=^\d+)(?=\d{4}$)/,           "."],    // Automatically insert decimal
        [/(?<=\.)\./g,                    ""],     // Remove duplicate decimal points
        [/^\.\d\./,                       "0."],   // Overwrite ones digit with decimal point
        [/^(?=\.)/,                       "0"],    // Prepend leading 0
        [/.+(?=\d\.)/g,                   ""],     // Set new decimal point
        [/(?<caret>).(?=.*$(?<=\d{5}))/g, ""],     // Replace digit when over 4 decimal places
        [/(?<caret>)(?=\d*$(?<!\d{4}))/g,  "0"],   // Insert 0 when backspacing
        [/$(?<!\d{4})/,                   "0000"], // Ensure 4 decimal places
        [/^[2-9]/,                        "1"],    // Cap ones digit to 1
        [/(?<=^1(?<caret>).*)[1-9]/g,     "0"],    // Zero out fractional digits when inputting 1.0
        [/^1(?!\.0+$)/,                   "0"],    // Modulo 1 when setting fractional digits
        [/(?<=\.\d{4,}).+$/,              ""]);    // Truncate to 4 decimal places

    return Math.round(parseFloat(elem.value) * CLAMP_RADIUS);
}

function filterAngle(elem)
{
    filterElemValue(elem,
        [/[^\d.]/g,                       ""],      // Remove invalid characters
        [/(?<=^\d\d)(\d)(?<caret>)\./,    ".$1"],   // Automatically type digits after decimal
        [/(?<=^\d)(?<caret>)\d(?=\d\.)/,  ""],      // Type over tens digit
        [/(?<=^0)(?<caret>)\d(?=\.)/,     ""],      // Type over ones digit with zero
        [/(?<=^\d\d)(?<caret>)\d(?=\.)/,  ""],      // Type over ones digit
        [/(?<=^\d{0,2})$/,                ".00"],   // Automatically append decimal
        [/(?<=^\d+)(?=\d{2}$)/,           "."],     // Automatically insert decimal
        [/(?<=^\d*)\.\d+\./,              "."],     // Overwrite up to old decimal point
        [/(?<=\..*)\./g,                  ""],      // Remove duplicate decimal points
        [/^(?=\.)/,                       "0"],     // Prepend leading 0
        [/^0(?=\d)/,                      ""],      // Don't allow tens digit to be 0
        [/(?<caret>).(?=.*$(?<=\d{3}))/g, ""],      // Replace digit when over 2 decimal places
        [/(?<caret>)(?=.*$(?<!\d{2}))/g,  "0"],     // Insert 0 when backspacing
        [/$(?<!\d{2})/,                   "00"],    // Ensure 2 decimal places
        [/(?<=^9)(?=\d)/,                 "0.00"],  // Cap to 90
        [/(?<=\.\d{2,}).+$/,              ""]);     // Truncate to 2 decimal places

    return parseFloat(elem.value);
}

function removeCharAt(string, index)
{
    return string.slice(0, index) + string.slice(index + 1);
}

function splicedString(string, start, deleteCount, ...toInsert)
{
    let result = string.slice(0, start) + toInsert.join("");

    if (deleteCount !== undefined)
        return result + string.slice(start + deleteCount);
    else
        return result;
}

function emToPixels(elem, em)
{
    return em * parseFloat(elem.css("font-size"));
}

function formatCoordinate(x, y)
{
    let angle = x == 0 && y == 0 ? 0 : Math.atan(Math.abs(y) / Math.abs(x)) * 180 / Math.PI;
    // Add space for negative sign
    let formatX = (x < 0 ? "" : " ") + (x / CLAMP_RADIUS).toFixed(4);
    let formatY = (y < 0 ? "" : " ") + (y / CLAMP_RADIUS).toFixed(4);
    let formatAngle = angle.toFixed(2);
    return "(" + formatX + ", " + formatY +") " + formatAngle + "\xB0";
}

function isValidCoordinate(x, y)
{
    return x*x + y*y <= CLAMP_RADIUS * CLAMP_RADIUS;
}

function getDisplayRadius()
{
    return useGate ? GATE_RADIUS : CLAMP_RADIUS;
}

function getGateRadius(x, y)
{
    // Hey, how's it going. I'm Jack, and today, I'm here to tell you about the word "octagon".
    // Now, "octagon" is an amazing shape that has 8 fantastic sides and 8 awesome angles.
    // Here, let me show you. Oh no... OH MAN! I totally forgot to bring an octagon!
    // This is embarassing. Ok, don't worry, we can go find one. Come on, let's go find an octagon!
    //
    // Oh, oh... stop!
    //
    // Sorry Elmo, I can't stop at the stop sign right now. I'm busy looking for an octagon!
    //
    // Oh, oh, stop!
    //
    // Okay, Elmo, I see the stop sign, but I have to find an octagon!
    // If I stop, how can I find an octagon? How, Elmo, how!?
    //
    // *Stoooop*!
    //
    // Wait a minute... look! The stop sign has 1, 2, 3, 4, 5, 6, 7, 8 glorious sides...
    // and 1, 2, 3, 4, 5, 6, 7, 8 stunning angles! The stop sign is an octagon! We found an octagon!
    const sides = 8;
    const interiorAnglesSum = (sides - 2) * Math.PI;
    const halfInteriorAngle = interiorAnglesSum / sides / 2;

    let angle = Math.atan2(Math.abs(y), Math.abs(x)) % (2 * Math.PI / sides);

    // Law of sines
    return GATE_RADIUS * Math.sin(halfInteriorAngle)
                       / Math.sin(Math.PI - angle - halfInteriorAngle);
}

function isVisibleCoordinate(x, y)
{
    if (useGate)
        return x*x + y*y <= getGateRadius(x, y)**2;
    else
        return x*x + y*y <= CLAMP_RADIUS**2;
}

function clampCoordinates(x, y)
{
    const clamp = (x, y, radius) => {
        const magnitude = Math.sqrt(x*x + y*y);
        const scale = Math.min(radius / magnitude, 1.0);
        return [Math.trunc(x * scale), Math.trunc(y * scale)]
    };
    const gateRadius = getGateRadius(x, y);
    return clamp(...clamp(x, y, gateRadius), CLAMP_RADIUS);
}

function isRimCoordinate(x, y)
{
    return !isValidCoordinate(Math.abs(x) + 1, Math.abs(y) + 1);
}

function isDesyncCoordinate(x, y)
{
    let mulX = x > 0 ? 127 : 128;
    let mulY = y > 0 ? 127 : 128;
    let popoX = Math.abs(x / CLAMP_RADIUS);
    let popoY = Math.abs(y / CLAMP_RADIUS);
    let nanaX = Math.abs(Math.trunc(popoX * mulX) / mulX);
    let nanaY = Math.abs(Math.trunc(popoY * mulY) / mulY);

    let xInDeadzone = Math.abs(x) <= DEADZONE;
    let yInDeadzone = Math.abs(y) <= DEADZONE;
    let deadzone = xInDeadzone || yInDeadzone;

    let popo50 = Math.atan(popoY / popoX) >= 50 * Math.PI / 180;
    let nana50 = Math.atan(nanaY / nanaX) >= 50 * Math.PI / 180;
    if (popo50 != nana50 && !deadzone)
        return true;

    if ((nanaX >= 0.8000) != (popoX >= 0.8000))
        return true;

    if ((nanaY >= 0.6625) != (popoY >= 0.6625))
        return true;

    if ((nanaX >= 0.7000) != (popoX >= 0.7000) && yInDeadzone)
        return true;

    if (y < 0 && (nanaY >= 0.7000) != (popoY >= 0.7000) && xInDeadzone)
        return true;

    if ((nanaX >= 0.6250) != (popoX >= 0.6250))
        return true;

    if ((nanaX >= 0.7500) != (popoX >= 0.7500))
        return true;

    if (y > 0 && (nanaY >= 0.5625) != (popoY >= 0.5625))
        return true;

    if (y < 0 && popoX <= 0.5875 && popoY == 0.5500)
        return true;

    return false;
}

function getCoordinateStyle(unclampedX, unclampedY)
{
    if (!isVisibleCoordinate(unclampedX, unclampedY) || (unclampedX == 0 && unclampedY == 0))
        return ["black", "black"];

    let [x, y] = clampCoordinates(unclampedX, unclampedY);
    let xInDeadzone = Math.abs(x) <= DEADZONE;
    let yInDeadzone = Math.abs(y) <= DEADZONE;

    if (xInDeadzone && yInDeadzone)
        return ["#3C3C3C", "black"];

    /*if (isDesyncCoordinate(x, y))
        return "#FF0000";*/

    let fill;
    let stroke = [0, 0, 0];

    if (xInDeadzone || yInDeadzone)
        fill = [0x80, 0x80, 0x80];
    else
        fill = [0x50, 0x50, 0x50];

    for (let region of regions) {
        if (!region.matchesCoordinate(x, y))
            continue;

        let alpha = region.color[3] / 255;
        for (let j = 0; j < 3; j++) {
            fill[j] = fill[j] * (1 - alpha) + region.color[j] * alpha;
            if (region.displayMode == DisplayMode.Outline)
                stroke[j] = stroke[j] * (1 - alpha) + region.color[j] * alpha;
        }
    }

    if (x != unclampedX || y != unclampedY) {
        for (let j = 0; j < 3; j++) {
            fill[j]   *= CLAMPED_COLOR_MULT;
            stroke[j] *= CLAMPED_COLOR_MULT;
        }
    }

    return [
        "rgb(" + fill.join(",") + ")",
        "rgb(" + stroke.join(",") + ")"
    ];
}

function drawCoordinate(x, y)
{
    if (!isVisibleCoordinate(x, y))
        return;

    let [fill, stroke] = getCoordinateStyle(x, y);

    canvas.drawRect({
        fillStyle: fill,
        strokeStyle: stroke,
        fromCenter: false,
        x: (x + getDisplayRadius()) * CANVAS_SCALE + GRID_LINE_WIDTH * 1.5,
        y: (getDisplayRadius() - y) * CANVAS_SCALE + GRID_LINE_WIDTH * 1.5,
        width:  CANVAS_SCALE - GRID_LINE_WIDTH,
        height: CANVAS_SCALE - GRID_LINE_WIDTH,
        strokeWidth: GRID_LINE_WIDTH
    });
}

function drawStickMap()
{
    drawX = -getDisplayRadius();
    drawY = -getDisplayRadius();
    requestAnimationFrame(drawFrame);
}

function drawFrame(timestamp)
{
    while (drawX <= getDisplayRadius()) {
        while (drawY <= getDisplayRadius()) {
            drawCoordinate(drawX, drawY);
            drawY++;

            // Defer to next frame if taking too long
            if (performance.now() - timestamp > 1000 / MINIMUM_FRAMERATE) {
                requestAnimationFrame(drawFrame);
                return;
            }
        }

        drawX++;
        drawY = -getDisplayRadius();
    }

    if (loading) {
        let loadingScreen = $("#loading-screen");
        loading = false;
        loadingScreen.css("pointer-events", "none");
        loadingScreen.animate({opacity: 0.0}, 100, loadingScreen.remove);
    }
}

function addRegion()
{
    regions.push(new Region());
    updateJson();
    repositionRegions();
}

function updateJson()
{
    if (showingJson)
        $("#json-input").val(JSON.stringify(regions, null, 4));
}

function toggleJson()
{
    showingJson = !showingJson;

    if (showingJson) {
        $("#region-list-container").css("display", "none");
        $("#json-input").css("display", "initial");
        updateJson();
    } else {
        $("#region-list-container").css("display", "initial");
        $("#json-input").css("display", "none");
        repositionRegions(null, false);
    }
}

function toggleGate()
{
    useGate = !useGate;
    updateCanvasSize();
    drawStickMap();
}

function updateCanvasSize()
{
    canvasImageSize = (getDisplayRadius() * 2 + 1) * CANVAS_SCALE + GRID_LINE_WIDTH * 2;

    canvas.prop("width", canvasImageSize);
    canvas.prop("height", canvasImageSize);

    canvas.drawRect({
        fillStyle: "#000000",
        x: canvasImageSize / 2, y: canvasImageSize / 2,
        width: canvasImageSize, height: canvasImageSize
    });
}

function repositionRegions(exclude=null, interpolate=true)
{
    let top = 0;
    for (let i = regions.length - 1; i >= 0; i--) {
        if (regions[i] == exclude) {
            top += emToPixels($("body"), 0.5);
            continue;
        }

        regions[i].moveTo(top, interpolate);
        top += regions[i].outerHeight;
    }
}

$(function()
{
    template = $("#region-template").contents().filter(".region-container");
    canvas = $("canvas");
    updateCanvasSize();

    let mouseX, mouseY;
    let canvasContainer = $("#canvas-container");
    let coordinateSquare = $("#coordinate-square");
    let coordinateText = $("#coordinate-text");
    let body = $("body");
    let minRegionListWidth = emToPixels(body, 30);
    let minRegionListHeight = emToPixels(body, 25);

    function updateVerticalMode()
    {
        let windowWidth = window.innerWidth;
        let windowHeight = window.innerHeight;
        let canvasSizeHorz = Math.min(windowHeight, windowWidth  - minRegionListWidth);
        let canvasSizeVert = Math.min(windowWidth,  windowHeight - minRegionListHeight);
        let canvasSize = Math.max(canvasSizeHorz, canvasSizeVert);
        let baseMinCanvasSize = canvasImageSize * MIN_CANVAS_SCALE;
        let minCanvasSize = Math.min(baseMinCanvasSize, Math.min(windowWidth, windowHeight));
        let ratio = canvasSize / minCanvasSize;

        if (ratio >= 1.0) {
            body.css("font-size", "1rem");
            canvas.css("image-rendering", "auto");
        } else if (ratio < MIN_SCALE) {
            canvasSize /= MIN_SCALE;
            body.css("font-size", MIN_SCALE + "rem");
            canvas.css("image-rendering", "auto");
        } else {
            canvasSize = minCanvasSize;
            body.css("font-size", ratio + "rem");
            canvas.css("image-rendering", "pixelated");
        }

        canvas.css("width", canvasSize);
        canvas.css("height", canvasSize);
        canvasContainer.css("min-height", canvasSize);

        // Update mouseover square size for canvas scale
        let canvasScale = canvasSize / canvasImageSize;
        let squareSize = Math.round((CANVAS_SCALE - GRID_LINE_WIDTH * 2) * canvasScale);
        coordinateSquare.css("width", squareSize);
        coordinateSquare.css("height", squareSize);

        if (canvasSizeHorz >= canvasSizeVert) {
            // Horizontal
            body.addClass("horizontal");
            body.removeClass("vertical");
        } else {
            // Vertical
            body.removeClass("horizontal");
            body.addClass("vertical");
        }
    }

    function updateCoordinateDisplay()
    {
        let scale = canvas.innerHeight() / canvasImageSize;

        let unclampedX = Math.floor(mouseX / scale / CANVAS_SCALE - getDisplayRadius());
        let unclampedY = Math.ceil(getDisplayRadius() - mouseY / scale / CANVAS_SCALE);
        let [x, y] = clampCoordinates(unclampedX, unclampedY);

        coordinateText.text(formatCoordinate(x, y));

        let [color] = getCoordinateStyle(x, y);
        coordinateSquare.css("background-color", color);

        let pixelX = (x + getDisplayRadius()) * CANVAS_SCALE + GRID_LINE_WIDTH * 2;
        let pixelY = (getDisplayRadius() - y) * CANVAS_SCALE + GRID_LINE_WIDTH * 2;
        let offsetX = Math.round(canvas.offset().left + pixelX * scale);
        let offsetY = Math.round(canvas.offset().top  + pixelY * scale);
        coordinateSquare.css("left", offsetX);
        coordinateSquare.css("top", offsetY);

        let textX = offsetX + emToPixels(coordinateText, 1.0);
        let textY = offsetY + emToPixels(coordinateText, 1.0);
        let edgeX = canvasContainer.offset().left + canvasContainer.innerWidth();
        let edgeY = canvasContainer.offset().top  + canvasContainer.innerHeight();
        coordinateText.css("left", Math.min(textX, edgeX - coordinateText.outerWidth()));
        coordinateText.css("top",  Math.min(textY, edgeY - coordinateText.outerHeight()));
    }

    canvasContainer.mousemove(event => {
        mouseX = event.pageX - canvas.offset().left;
        mouseY = event.pageY - canvas.offset().top;
        updateCoordinateDisplay();
    });

    $(window).resize(() => {
        updateVerticalMode();
        repositionRegions(null, false);
        updateCoordinateDisplay();
    });

    $("#json-input").on("input", function() {
        let newRegions;

        try {
            newRegions = JSON.parse(this.value);
        } catch {
            $(this).addClass("invalid-input");
            return;
        }

        $(this).removeClass("invalid-input");
        $("#region-list").empty();
        regions = newRegions.map(json => new Region(json));
        repositionRegions(null, false);
        drawStickMap();
    });

    updateVerticalMode();
    drawStickMap();
    addRegion();
});