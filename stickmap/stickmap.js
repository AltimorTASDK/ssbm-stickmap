const DEADZONE = 22;

// Minimum framerate to maintain while redrawing canvas
const MINIMUM_FRAMERATE = 255;

//const DISPLAY_RADIUS = 103; // Unclamped range
const DISPLAY_RADIUS = 80; // Unclamped range
const CLAMP_RADIUS = 80; // Clamped range

const GRID_LINE_WIDTH = 1;
const CANVAS_SCALE = 6;
const CANVAS_SIZE = (DISPLAY_RADIUS * 2 + 1) * CANVAS_SCALE - GRID_LINE_WIDTH * 2;
const MIN_CANVAS_SIZE = CANVAS_SIZE * 0.5;

// em
const SCROLL_DISTANCE = 2.0;

const DisplayMode = {
    Normal: 0,
    Outline: 1,
    RimOnly: 2
};

let loading = true;

let regions = [];
let template = null;
let canvas = null;

// Saved between partial canvas draws
let drawX = 0;
let drawY = 0;

function Region(name)
{
    function filterCoord(elem, coordinate)
    {
        let selectionStart = elem.selectionStart;
        let selectionEnd = elem.selectionEnd;

        // Don't allow typing decimal points in the wrong spot
        if (selectionStart != 2 && elem.value[selectionStart - 1] == ".") {
            elem.value = removeCharAt(elem.value, selectionStart - 1);
            selectionStart--;
            selectionEnd--;
        }

        // Ensure leading zero
        if (elem.value.indexOf(".") == 0)
            elem.value = "0" + elem.value;

        // Remove duplicate decimal points
        while (elem.value.indexOf(".") != elem.value.lastIndexOf("."))
            elem.value = removeCharAt(elem.value, elem.value.lastIndexOf("."));

        if (elem.value.length > 6) {
            // Limit length
            elem.value = removeCharAt(elem.value, selectionStart);
            elem.value = elem.value.substring(0, 6);
        } else if (elem.value.length < 6) {
            // Ensure 4 decimal places
            elem.value = elem.value.padEnd(6, "0");
        }

        let value = parseFloat(elem.value, 0);
        if (!isNaN(value) && !elem.value.match(/[^\d.]/)) {
            if (value > 1.0) {
                elem.value = "1.0000";
                coordinate = CLAMP_RADIUS;
            } else {
                coordinate = Math.round(value * CLAMP_RADIUS);
            }

            $(elem).removeClass("invalid-input");
        } else {
            $(elem).addClass("invalid-input");
        }

        elem.selectionStart = selectionStart;
        elem.selectionEnd = selectionEnd;

        return coordinate;
    }

    function filterAngle(elem, angle)
    {
        let selectionStart = elem.selectionStart;
        let selectionEnd = elem.selectionEnd;

        // Don't allow typing additional decimal points
        if (elem.value.indexOf(".") != elem.value.lastIndexOf(".")) {
            if (elem.value[selectionStart - 1] == ".") {
                if (elem.value[selectionStart] == ".") {
                    // Typing over existing decimal point
                    elem.value = removeCharAt(elem.value, selectionStart);
                } else {
                    elem.value = removeCharAt(elem.value, selectionStart - 1);
                    selectionStart--;
                    selectionEnd--;
                }
            }

            while (elem.value.indexOf(".") != elem.value.lastIndexOf(".")) {
                let index = elem.value.lastIndexOf(".");
                elem.value = removeCharAt(elem.value, index);
            }
        }

        // Ensure decimal point
        if (elem.value.indexOf(".") == -1)
            elem.value += ".00";

        // Ensure leading zero
        if (elem.value.indexOf(".") == 0 && selectionStart != 0) {
            elem.value = "0" + elem.value;
            selectionStart++;
            selectionEnd++;
        }

        // Ensure 2 decimal places
        let decimalPlaces = elem.value.length - elem.value.indexOf(".") - 1;
        if (decimalPlaces > 2) {
            if (selectionStart > elem.value.indexOf("."))
                elem.value = removeCharAt(elem.value, selectionStart);

            elem.value = elem.value.substring(0, elem.value.indexOf(".") + 3);
        } else if (decimalPlaces < 2) {
            elem.value = elem.value.padEnd(elem.value.indexOf(".") + 3, "0");
        }

        // Limit length
        if (elem.value.length > 5) {
            elem.value = removeCharAt(elem.value, selectionStart);
            elem.value = elem.value.substring(0, 5);
        }

        let value = parseFloat(elem.value, 0);
        if (!isNaN(value) && !elem.value.match(/[^\d.]/)) {
            if (value > 90.0) {
                elem.value = "90.00";
                angle = 90.0;
            } else {
                angle = value;
            }

            $(elem).removeClass("invalid-input");
        } else {
            $(elem).addClass("invalid-input");
        }

        elem.selectionStart = selectionStart;
        elem.selectionEnd = selectionEnd;

        return angle;
    }

    function roundCoord(elem)
    {
        let value = parseFloat(elem.value, 0);
        if (isNaN(value) || elem.value.match(/[^\d.]/))
            return;

        let selectionStart = elem.selectionStart;
        let selectionEnd = elem.selectionEnd;
        elem.value = (Math.round(value * CLAMP_RADIUS) / CLAMP_RADIUS).toFixed(4);
        elem.selectionStart = selectionStart;
        elem.selectionEnd = selectionEnd;
    }

    this.containsCoordinate = function(x, y)
    {
        if (!isValidCoordinate(x, y))
            return false;

        // Check quadrant
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

        // Check bounds
        let absX = Math.abs(x);
        let absY = Math.abs(y);

        if (absX < this.minX || absX > this.maxX)
            return false;

        if (absY < this.minY || absY > this.maxY)
            return false;

        // Check angle
        let roundedX = absX > DEADZONE ? absX : 0;
        let roundedY = absY > DEADZONE ? absY : 0;

        let angle = Math.atan(roundedY / roundedX) * 180 / Math.PI;
        if (angle < this.angleMin || angle > this.angleMax)
            return false;

        let magnitude = Math.sqrt(roundedX**2 + roundedY**2);
        if (magnitude < this.magnitudeMin || magnitude > this.magnitudeMax)
            return false;

        return true;
    };

    this.matchesCoordinate = function(x, y)
    {
        if (this.displayMode == DisplayMode.RimOnly && !isRimCoordinate(x, y))
            return false;

        if (this.displayMode == DisplayMode.Outline &&
                this.containsCoordinate(x + 1, y) &&
                this.containsCoordinate(x, y + 1) &&
                this.containsCoordinate(x - 1, y) &&
                this.containsCoordinate(x, y - 1))
            return false;

        return this.containsCoordinate(x, y);
    };

    this.getFillStyle = function()
    {
        let alpha = this.color[3] / 255;
        return "rgba(" + this.color.slice(0, 3).join(",") + "," + alpha + ")";
    };

    this.getFillStyleNoAlpha = function()
    {
        return "rgb(" + this.color.slice(0, 3).join(",") + ")";
    };

    this.updateColorSquare = function()
    {
        let colorSquareLeft = $(this.element).find(".color-square-left");
        let colorSquareRight = $(this.element).find(".color-square-right");
        colorSquareLeft.css("background-color", this.getFillStyleNoAlpha());
        colorSquareRight.css("background-color", this.getFillStyle());
    };

    this.updateColorPicker = function()
    {
        let picker = "#";
        for (let i = 0; i < 3; i++)
            picker += this.color[i].toString(16).padStart(2, "0");

        $(this.element).find("#picker").val(picker);
    };

    this.getName = function()
    {
        return this.element.find("#region-name").val();
    };

    this.element = template.clone();
    this.color = [255, 255, 255, 255]
    this.quadrants = [false, false, false, false]
    this.displayMode = DisplayMode.Normal;
    this.minX = this.minY = 0;
    this.maxX = this.maxY = CLAMP_RADIUS;
    this.angleMin = 0.0;
    this.angleMax = 90.0;
    this.magnitudeMin = 0;
    this.magnitudeMax = 80;

    this.clicked = false;
    this.dragging = false;
    this.dragStart = 0;
    this.dragOffset = 0;

    this.scrolling = false;
    this.scrollDistance = 0.0;

    this.deleting = false;

    // Set name
    this.element.find("#region-name").val(name);

    let region = this;

    // Mouse dragging
    this.element.find(".drag-handle").mousedown(function(event)
    {
        region.dragStart = event.pageY;
        region.dragOffset = event.pageY - region.element.offset().top;
        region.clicked = true;
        region.scrolling = false;
        $("body").css("user-select", "none");
    });

    function updateRegionOrder(mouseY)
    {
        for (let i = 0; i < regions.length; i++) {
            if (regions[i] == region)
                continue;

            let otherElem = regions[i].element;
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

    $(document).mousemove(event => {
        if (!region.clicked)
            return;

        let elem = region.element;

        if (!region.dragging && Math.abs(event.pageY - region.dragStart) > 40) {
            region.dragging = true;

            lockRegionListHeight();

            elem.css("z-index", 100);
            elem.animate({opacity: 0.5});
            elem.css({height: elem.height()});

            let regionContent = elem.find(".region-content");
            region.contentHeight = regionContent.height();
            regionContent.animate({height: 0}, {queue: false, duration: 200});

            moveDragPositionBar(regions.indexOf(region), false);
            repositionRegions(region);
        }

        if (!region.dragging)
            return;

        // Auto scroll
        let userInput = $("#user-input");
        let regionList = $("#region-list");
        let regionHeader = elem.find(".region-header");
        let maxScrollDistance = emToPixels($("body"), SCROLL_DISTANCE);

        let autoScroll = () => {
            if (!region.dragging || !region.scrolling)
                return;

            let scrollSpeed;
            let distance = region.scrollDistance;
            let top = -regionList.offset().top;

            if (distance > 0) {
                scrollSpeed = Math.min(distance, maxScrollDistance);
                top += scrollSpeed * 2 - maxScrollDistance;
                top += userInput.innerHeight() - regionHeader.height();
            } else {
                scrollSpeed = Math.max(distance, -maxScrollDistance);
                top += scrollSpeed * 2 + maxScrollDistance;
            }

            let topMax = regionList.innerHeight() - regionHeader.height();
            elem.animate({top: Math.min(Math.max(top, 0), topMax)}, {
                duration: 20,
                easing: "linear"
            });

            let parentTop = elem.parent().offset().top;
            let mouseY = top + parentTop + region.dragOffset;

            userInput.animate({scrollTop: "+=" + scrollSpeed}, {
                duration: 20,
                easing: "linear",
                complete: () => {
                    updateRegionOrder(mouseY);
                    autoScroll();
                }
            });
        }

        let scrollTop = userInput.scrollTop();
        let scrollBottom = scrollTop + userInput.innerHeight();
        let absTop = scrollTop + event.pageY - region.dragOffset;
        let absBottom = absTop + regionHeader.height();
        let upScroll = Math.min(scrollTop - absTop, 0);
        let downScroll = Math.min(absBottom - scrollBottom, 0);

        if (upScroll > -maxScrollDistance) {
            region.scrollDistance = -upScroll - maxScrollDistance;
        } else if (downScroll > -maxScrollDistance) {
            region.scrollDistance = downScroll + maxScrollDistance;
        } else {
            let parentTop = elem.parent().offset().top;
            let top = event.pageY - parentTop - region.dragOffset;
            let topMax = userInput.height() - regionList.offset().top;
            elem.css("top", Math.min(Math.max(top, 0), topMax));

            if (region.scrolling) {
                region.scrolling = false;
                region.scrollDistance = 0.0;
                userInput.stop();
            }
        }

        if (!region.scrolling && region.scrollDistance != 0.0) {
            region.scrolling = true;
            autoScroll();
        }

        updateRegionOrder(event.pageY);
    });

    $(document).mouseup(() => {
        if (!region.clicked)
            return;

        setTimeout(() => {
            unlockRegionListHeight();
            region.element.css("z-index", "auto");
        }, 400);

        repositionRegions();

        region.element.css("height", "auto");
        region.element.animate({opacity: 1.0}, {queue: false});

        $("body").css("user-select", "initial");

        let bar = $("#drag-position-bar");
        bar.stop();
        bar.animate({opacity: 0.0});

        let regionContent = region.element.find(".region-content");
        regionContent.animate({height: region.contentHeight}, {
            duration: 200,
            queue: false,
            complete: () => regionContent.css("height", "auto")
        });

        region.clicked = false;
        region.dragging = false;
    });

    // Delete button
    this.element.find(".delete-button").click(function()
    {
        if (region.deleting)
            return;

        region.deleting = true;

        regions.splice(regions.indexOf(region), 1);
        repositionRegions();
        drawStickMap();

        region.element.animate({height: 0}, {
            queue: false,
            complete: () => region.element.remove()
        });
    });

    // Move up button
    this.element.find(".move-button-up").click(function()
    {
        let index = regions.indexOf(region);
        if (index == regions.length - 1)
            return;

        let temp = regions[index + 1];
        regions[index + 1] = region;
        regions[index] = temp;

        lockRegionListHeight();
        repositionRegions();
        drawStickMap();

        region.element.css("z-index", "50");
        setTimeout(() => {
            unlockRegionListHeight();
            region.element.css("z-index", "auto");
        }, 400);
    });

    // Move down button
    this.element.find(".move-button-down").click(function()
    {
        let index = regions.indexOf(region);
        if (index == 0)
            return;

        let temp = regions[index - 1];
        regions[index - 1] = region;
        regions[index] = temp;

        lockRegionListHeight();
        repositionRegions();
        drawStickMap();

        region.element.css("z-index", "50");
        setTimeout(() => {
            unlockRegionListHeight();
            region.element.css("z-index", "auto");
        }, 400);
    });

    // Color input
    this.element.find("#picker").change(function()
    {
        let color = this.value;
        for (let i = 0; i < 3; i++) {
            let elem = region.element.find("#color #" + i);
            region.color[i] = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
            elem.val(region.color[i]);
        }

        region.updateColorSquare();
        drawStickMap();
    });

    for (let i = 0; i < 4; i++) {
        this.element.find("#color #" + i).on("input", function()
        {
            let selectionStart = this.selectionStart;
            let selectionEnd = this.selectionEnd;

            if (this.value.length > 3) {
                this.value = removeCharAt(this.value, selectionStart);
                this.value = this.value.substring(0, 3);
            }

            let value = parseInt(this.value, 0);
            if (!isNaN(value) && !this.value.match(/[^\d]/)) {
                if (value > 255)
                    region.color[i] = this.value = 255;
                else
                    region.color[i] = value;

                $(this).removeClass("invalid-input");
            } else {
                $(this).addClass("invalid-input");
            }

            this.selectionStart = selectionStart;
            this.selectionEnd = selectionEnd;

            region.updateColorSquare();
            region.updateColorPicker();

            drawStickMap();
        });
    }

    // Quadrant selection
    for (let i = 0; i < 4; i++) {
        this.element.find("#quadrant #" + i).click(function()
        {
            $(this).toggleClass("quadrant-selected");
            region.quadrants[i] = !region.quadrants[i];
            drawStickMap();
        });
    }

    // Display mode
    this.element.find("#display-mode").change(function()
    {
        region.displayMode = this.value;
        drawStickMap();
    });

    // Coordinate input
    this.element.find("#x #min").on("input", function()
    {
        region.minX = filterCoord(this, region.minX);
        drawStickMap();
    });

    this.element.find("#x #max").on("input", function()
    {
        region.maxX = filterCoord(this, region.maxX);
        drawStickMap();
    });

    this.element.find("#y #min").on("input", function()
    {
        region.minY = filterCoord(this, region.minY);
        drawStickMap();
    });

    this.element.find("#y #max").on("input", function()
    {
        region.maxY = filterCoord(this, region.maxY);
        drawStickMap();
    });

    this.element.find("#x #min").change(function() { roundCoord(this); });
    this.element.find("#x #max").change(function() { roundCoord(this); });
    this.element.find("#y #min").change(function() { roundCoord(this); });
    this.element.find("#y #max").change(function() { roundCoord(this); });
    this.element.find("#magnitude #min").change(function() { roundCoord(this); });
    this.element.find("#magnitude #max").change(function() { roundCoord(this); });

    // Angle input
    this.element.find("#angle #min").on("input", function()
    {
        region.angleMin = filterAngle(this, region.angleMin);
        drawStickMap();
    });

    this.element.find("#angle #max").on("input", function()
    {
        region.angleMax = filterAngle(this, region.angleMax);
        drawStickMap();
    });

    // Magnitude input
    this.element.find("#magnitude #min").on("input", function()
    {
        region.magnitudeMin = filterCoord(this, region.magnitudeMin);
        drawStickMap();
    });

    this.element.find("#magnitude #max").on("input", function()
    {
        region.magnitudeMax = filterCoord(this, region.magnitudeMax);
        drawStickMap();
    });

    this.element.prependTo("#region-list");
}

function removeCharAt(string, i)
{
    let array = string.split("");
    array.splice(i, 1);
    return array.join("");
}

function emToPixels(elem, em)
{
    return em * parseInt(elem.css("font-size"));
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

function getCoordinateFillStyle(x, y, clamped)
{
    if (!isValidCoordinate(x, y) || (x == 0 && y == 0))
        return "black";

    let xInDeadzone = Math.abs(x) <= DEADZONE;
    let yInDeadzone = Math.abs(y) <= DEADZONE;

    if (xInDeadzone && yInDeadzone)
        return "#3C3C3C";

    /*if (isDesyncCoordinate(x, y))
        return "#FF0000";*/

    let color;

    /*if (yInDeadzone)
        color = [0x50, 0x50, 0xC8];
    else if (xInDeadzone)
        color = y > 0 ? [0x50, 0x78, 0x50] : [0x78, 0x50, 0x50];*/
    if (xInDeadzone || yInDeadzone)
        color = [0x80, 0x80, 0x80];
    else
        color = [0x50, 0x50, 0x50];

    for (let region of regions) {
        if (!region.matchesCoordinate(x, y))
            continue;

        if (clamped && region.displayMode == DisplayMode.Outline)
            continue;

        let alpha = region.color[3] / 255;
        for (let j = 0; j < 3; j++)
            color[j] = color[j] * (1 - alpha) + region.color[j] * alpha;
    }

    if (clamped) {
        for (let j = 0; j < 3; j++)
            color[j] = color[j] * .34;
    }

    return "rgb(" + color.join(",") + ")";
}

function getCoordinateStrokeStyle(x, y)
{
    if (!isValidCoordinate(x, y) || (x == 0 && y == 0))
        return "black";

    let xInDeadzone = Math.abs(x) <= DEADZONE;
    let yInDeadzone = Math.abs(y) <= DEADZONE;

    if (xInDeadzone && yInDeadzone)
        return "black";

    let color = [0, 0, 0];

    for (let region of regions) {
        if (region.displayMode != DisplayMode.Outline)
            continue;

        if (!region.matchesCoordinate(x, y))
            continue;

        let alpha = region.color[3] / 255;
        for (let j = 0; j < 3; j++)
            color[j] = color[j] * (1 - alpha) + region.color[j] * alpha;
    }

    return "rgb(" + color.join(",") + ")";
}

function clampCoordinates(x, y)
{
    let magnitude = Math.sqrt(x*x + y*y);
    let scale = Math.min(CLAMP_RADIUS / magnitude, 1.0);
    return [Math.trunc(x * scale), Math.trunc(y * scale)]
}

function drawCoordinate(x, y)
{
    if (x*x + y*y > DISPLAY_RADIUS * DISPLAY_RADIUS)
        return;

    let [clampedX, clampedY] = clampCoordinates(x, y)
    let clamped = x != clampedX || y != clampedY;

    canvas.drawRect({
        fillStyle: getCoordinateFillStyle(clampedX, clampedY, clamped),
        fromCenter: false,
        x: (x + DISPLAY_RADIUS) * CANVAS_SCALE + GRID_LINE_WIDTH,
        y: (DISPLAY_RADIUS - y) * CANVAS_SCALE + GRID_LINE_WIDTH,
        width:  CANVAS_SCALE - GRID_LINE_WIDTH * 2,
        height: CANVAS_SCALE - GRID_LINE_WIDTH * 2,
        strokeWidth: GRID_LINE_WIDTH
    });
}

function findMatchingCoordinate(region)
{
    // Find any matching coordinate
    for (let x = 0; x <= CLAMP_RADIUS; x++) {
        for (let y = 0; y <= CLAMP_RADIUS; y++) {
            if (region.matchesCoordinate(x, y))
                return {x: x, y: y};
            else if (region.matchesCoordinate(-x, y))
                return {x: -x, y: y};
            else if (region.matchesCoordinate(x, -y))
                return {x: x, y: -y};
            else if (region.matchesCoordinate(-x, -y))
                return {x: -x, y: -y};
        }
    }
    return null;
}

function findAdjacentCoordinate(region, x, y, lastX, lastY)
{
    const diagonals = [
        {x: 1, y: 1},
        {x: -1, y: 1},
        {x: -1, y: -1},
        {x: 1, y: -1}
    ];

    const cardinals = [
        {x: 1, y: 0},
        {x: 0, y: 1},
        {x: -1, y: 0},
        {x: 0, y: -1}
    ];

    let directionX = Math.min(Math.max(x - lastX, -1), 1);
    let directionY = Math.min(Math.max(y - lastY, -1), 1);
    lastX = x - directionX;
    lastY = y - directionY;

    if (x != lastX || y != lastY && (directionX == 0 || directionY == 0)) {
        if (region.matchesCoordinate(x + directionX * 2, y + directionY * 2))
            return {x: x + directionX, y: y + directionY};
    }

    for (let offset of diagonals) {
        let testX = x + offset.x;
        let testY = y + offset.y;
        if (testX == lastX || testY == lastY)
            continue;

        if (region.matchesCoordinate(testX, testY))
            return {x: testX, y: testY};
    }

    if (x != lastX || y != lastY) {
        if (region.matchesCoordinate(x + directionX, y + directionY))
            return {x: x + directionX, y: y + directionY};
        else if (region.matchesCoordinate(x + directionX, y))
            return {x: x + directionX, y: y};
        else if (region.matchesCoordinate(x, y + directionY))
            return {x: x, y: y + directionY};
    }

    for (let offset of cardinals) {
        let testX = x + offset.x;
        let testY = y + offset.y;
        if (testX == lastX && testY == lastY)
            continue;

        if (region.matchesCoordinate(testX, testY))
            return {x: testX, y: testY};
    }

    return null;
}

function drawOutlineRegion(ctx, region)
{
    let start = findMatchingCoordinate(region);
    if (start == null)
        return;

    let x = start.x;
    let y = start.y;
    let lastX = x;
    let lastY = y;
    let lastDirectionX = 0;
    let lastDirectionY = 0;
    let count = 0;
    let test = 0;

    ctx.beginPath();
    let startLineX = (x + CLAMP_RADIUS + .5) * CANVAS_SCALE;
    let startLineY = (CLAMP_RADIUS + .5 - y) * CANVAS_SCALE;
    ctx.moveTo(startLineX, startLineY);

    do {
        let directionX = Math.min(Math.max(x - lastX, -1), 1);
        let directionY = Math.min(Math.max(y - lastY, -1), 1);

        if (directionX != lastDirectionX || directionY != lastDirectionY) {
            let lineX = (lastX + CLAMP_RADIUS + .5) * CANVAS_SCALE;
            let lineY = (CLAMP_RADIUS + .5 - lastY) * CANVAS_SCALE;
            ctx.lineTo(lineX, lineY);
        }

        let adjacent = findAdjacentCoordinate(region, x, y, lastX, lastY);
        if (adjacent == null)
            break;

        lastDirectionX = directionX;
        lastDirectionY = directionY;
        lastX = x;
        lastY = y;
        x = adjacent.x;
        y = adjacent.y;
    } while ((x != start.x || y != start.y) && ++count < 10000);

    ctx.strokeStyle = region.getFillStyle();
    ctx.lineWidth = 4;
    ctx.stroke();
}

function drawRegionLine(ctx, region)
{
    let totalX = 0;
    let totalY = 0;
    let totalCount = 0;

    // Find any matching coordinate
    for (let x = -CLAMP_RADIUS; x <= CLAMP_RADIUS; x++) {
        for (let y = -CLAMP_RADIUS; y <= CLAMP_RADIUS; y++) {
            if (!region.matchesCoordinate(x, y))
                continue;

            totalX += x;
            totalY += y;
            totalCount++;
        }
    }

    ctx.beginPath();

    let center = (DISPLAY_RADIUS + .5) * CANVAS_SCALE;
    ctx.moveTo(center, center);

    let lineX = (totalX / totalCount + DISPLAY_RADIUS + .5) * CANVAS_SCALE;
    let lineY = (DISPLAY_RADIUS + .5 - totalY / totalCount) * CANVAS_SCALE;
    ctx.lineTo(lineX, lineY);

    ctx.strokeStyle = region.getFillStyle();
    ctx.lineWidth = 4;
    ctx.stroke();
}

function drawStickMap()
{
    drawX = -DISPLAY_RADIUS;
    drawY = -DISPLAY_RADIUS;
    requestAnimationFrame(drawFrame);
}

function drawFrame(timestamp)
{
    let finished = true;

    canvas.draw({fn: () => {
        while (drawX <= DISPLAY_RADIUS) {
            while (drawY <= DISPLAY_RADIUS) {
                drawCoordinate(drawX, drawY);
                drawY++;

                // Defer to next frame if taking too long
                if (performance.now() - timestamp > 1000 / MINIMUM_FRAMERATE) {
                    requestAnimationFrame(drawFrame);
                    finished = false;
                    return;
                }
            }

            drawX++;
            drawY = -DISPLAY_RADIUS;
        }

        /*for (let region of regions)
            drawRegionLine(ctx, region);*/

        /*for (let region of regions) {
            if (region.displayMode == DisplayMode.Outline)
                drawOutlineRegion(ctx, region);
        }*/
    }});

    if (!finished || !loading)
        return;

    let loadingScreen = $("#loading-screen");
    loading = false;
    loadingScreen.css("pointer-events", "none");
    loadingScreen.animate({opacity: 0.0}, 100, loadingScreen.remove);
}

function repositionRegions(exclude=null, interpolate=true)
{
    let top = 0;
    for (let i = regions.length - 1; i >= 0; i--) {
        let elem = regions[i].element;
        if (regions[i] == exclude) {
            top += emToPixels(elem, 0.5);
            continue;
        }

        if (interpolate)
            elem.animate({top: top}, {queue: false});
        else
            elem.css("top", top);

        top += elem.outerHeight();
    }
}

function addRegion()
{
    regions.push(new Region("Region " + (regions.length + 1)));
    repositionRegions();
}

function moveDragPositionBar(index, interpolate=true)
{
    let top = 0;

    for (let i = regions.length - 1; i > index; i--)
        top += regions[i].element.outerHeight();

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
            height += region.element.outerHeight();

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

$(function()
{
    template = $("#region-template").contents().filter(".region-container");
    canvas = $("canvas");

    canvas.prop("width", CANVAS_SIZE);
    canvas.prop("height", CANVAS_SIZE);

    canvas.drawRect({
        fillStyle: "#000000",
        x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2,
        width: CANVAS_SIZE, height: CANVAS_SIZE
    });

    let mouseX, mouseY;
    let pageContainer = $("#page-container");
    let canvasContainer = $("#canvas-container");
    let coordinateSquare = $("#coordinate-square");
    let coordinateText = $("#coordinate-text");
    let body = $("body");
    let minLeftSideWidth = emToPixels(body, 30);
    let minLeftSideHeight = emToPixels(body, 25);

    function updateVerticalMode()
    {
        let canvasSizeHorizontal;
        if (window.innerWidth - window.innerHeight >= minLeftSideWidth)
            canvasSizeHorizontal = window.innerHeight;
        else
            canvasSizeHorizontal = window.innerWidth - minLeftSideWidth;

        let canvasSizeVertical;
        if (window.innerHeight - window.innerWidth >= minLeftSideHeight)
            canvasSizeVertical = window.innerWidth;
        else
            canvasSizeVertical = window.innerHeight - minLeftSideHeight;

        let windowSize = Math.min(window.innerWidth, window.innerHeight);
        let canvasSize = Math.max(canvasSizeHorizontal, canvasSizeVertical);
        let minCanvasSize = Math.min(MIN_CANVAS_SIZE, windowSize);

        let scale;
        if (canvasSize < minCanvasSize)
            scale = Math.max(canvasSize / minCanvasSize, 0.6);
        else
            scale = 1.0;

        canvasSize /= scale;
        body.css("font-size", 1.25 * scale + "rem");

        if (canvasSize == MIN_CANVAS_SIZE)
            canvas.css("image-rendering", "pixelated");
        else
            canvas.css("image-rendering", "auto");

        if (canvasSizeHorizontal >= canvasSizeVertical) {
            // Horizontal
            canvas.css("width", canvasSize);
            canvas.css("height", canvasSize);
            canvasContainer.css("min-height", canvasSize);
            pageContainer.css("flex-direction", "row");
            body.addClass("horizontal");
            body.removeClass("vertical");
        } else {
            // Vertical
            canvas.css("width", canvasSize);
            canvas.css("height", canvasSize);
            canvasContainer.css("min-height", canvasSize);
            pageContainer.css("flex-direction", "column-reverse");
            body.removeClass("horizontal");
            body.addClass("vertical");
        }
    }

    function updateCoordinateDisplay()
    {
        let scale = CANVAS_SIZE / canvas.innerHeight();

        let unclampedX = Math.floor(mouseX * scale / CANVAS_SCALE - DISPLAY_RADIUS);
        let unclampedY = Math.ceil(DISPLAY_RADIUS - mouseY * scale / CANVAS_SCALE);
        let [x, y] = clampCoordinates(unclampedX, unclampedY);

        coordinateText.text(formatCoordinate(x, y));

        let color = getCoordinateFillStyle(x, y);
        coordinateSquare.css("margin-left", -2 / scale);
        coordinateSquare.css("margin-top", -2 / scale);
        coordinateSquare.css("width", 4 / scale);
        coordinateSquare.css("height", 4 / scale);
        coordinateSquare.css("background-color", color);

        let canvasX = canvas.offset().left;
        let canvasY = canvas.offset().top;
        let pixelX = (x + DISPLAY_RADIUS + .5) * CANVAS_SCALE - GRID_LINE_WIDTH;
        let pixelY = (DISPLAY_RADIUS + .5 - y) * CANVAS_SCALE - GRID_LINE_WIDTH;
        let offsetX = canvasX + Math.round(pixelX / scale);
        let offsetY = canvasY + Math.round(pixelY / scale);
        coordinateSquare.css("left", offsetX);
        coordinateSquare.css("top", offsetY);

        let textWidth = coordinateText.outerWidth();
        let textHeight = coordinateText.outerHeight();
        let textX = offsetX + emToPixels(coordinateText, 1.0);
        let textY = offsetY + emToPixels(coordinateText, 1.0);
        let maxOffsetX = canvasX + canvas.innerWidth() - textWidth;
        let maxOffsetY = canvasY + canvas.innerHeight() - textHeight;
        coordinateText.css("left", Math.min(textX, maxOffsetX));
        coordinateText.css("top", Math.min(textY, maxOffsetY));
    }

    canvas.mousemove(event => {
        mouseX = event.offsetX;
        mouseY = event.offsetY;
        updateCoordinateDisplay();
    });

    $(window).resize(() => {
        updateVerticalMode();
        repositionRegions(null, false);
        updateCoordinateDisplay();
    });

    updateVerticalMode();
    drawStickMap();
    addRegion();
});