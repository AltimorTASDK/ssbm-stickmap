const DEADZONE = 22;

// Minimum framerate to maintain while redrawing canvas
const MINIMUM_FRAMERATE = 255;

const DISPLAY_RADIUS = 103; // Unclamped range
const CLAMP_RADIUS = 80; // Clamped range

// How much to darken clamped coordinates
const CLAMPED_COLOR_MULT = 1.0 / 3.0;

const GRID_LINE_WIDTH = 1;
const CANVAS_SCALE = 6;
const CANVAS_SIZE = (DISPLAY_RADIUS * 2 + 1) * CANVAS_SCALE + GRID_LINE_WIDTH * 2;
const MIN_CANVAS_SIZE = CANVAS_SIZE * 0.5;

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

    this.matchesQuadrants = function(x, y)
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

    this.containsCoordinate = function(x, y)
    {
        if (!isValidCoordinate(x, y))
            return false;

        // Check quadrant
        if (!this.matchesQuadrants(x, y))
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
                this.containsCoordinate(x + 1, y    ) &&
                this.containsCoordinate(x + 1, y + 1) &&
                this.containsCoordinate(x,     y + 1) &&
                this.containsCoordinate(x - 1, y + 1) &&
                this.containsCoordinate(x - 1, y    ) &&
                this.containsCoordinate(x - 1, y - 1) &&
                this.containsCoordinate(x,     y - 1) &&
                this.containsCoordinate(x + 1, y - 1))
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
        let minDragDistance = emToPixels($("body"), MIN_DRAG_DISTANCE);

        if (!region.dragging && Math.abs(event.pageY - region.dragStart) > minDragDistance) {
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
        let autoScrollDistance = emToPixels($("body"), AUTO_SCROLL_DISTANCE);

        let autoScroll = () => {
            if (!region.dragging || !region.scrolling)
                return;

            let scrollSpeed;
            let distance = region.scrollDistance;
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

        let scrollAreaTop = userInput.offset().top;
        let scrollAreaBottom = scrollAreaTop + userInput.innerHeight();
        let headerTop = event.pageY - region.dragOffset;
        let headerBottom = headerTop + regionHeader.height();
        let distanceTop = Math.min(scrollAreaTop - headerTop, 0);
        let distanceBottom = Math.min(headerBottom - scrollAreaBottom, 0);

        if (distanceTop > -autoScrollDistance) {
            region.scrollDistance = -distanceTop - autoScrollDistance;
        } else if (distanceBottom > -autoScrollDistance) {
            region.scrollDistance = distanceBottom + autoScrollDistance;
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

function getVisibleRadius(x, y)
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
    const interior_angles_sum = (sides - 2) * Math.PI;
    const half_interior_angle = interior_angles_sum / sides / 2;

    let angle = Math.atan2(Math.abs(y), Math.abs(x)) % (2 * Math.PI / sides);

    // Law of sines
    return DISPLAY_RADIUS * Math.sin(half_interior_angle)
                          / Math.sin(Math.PI - angle - half_interior_angle);
}

function isVisibleCoordinate(x, y)
{
    return x*x + y*y <= getVisibleRadius(x, y)**2;
}

function clampCoordinates(x, y)
{
    let magnitude = Math.sqrt(x*x + y*y);
    let scale = Math.min(CLAMP_RADIUS / magnitude, 1.0);
    return [Math.trunc(x * scale), Math.trunc(y * scale)]
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
        x: (x + DISPLAY_RADIUS) * CANVAS_SCALE + GRID_LINE_WIDTH * 1.5,
        y: (DISPLAY_RADIUS - y) * CANVAS_SCALE + GRID_LINE_WIDTH * 1.5,
        width:  CANVAS_SCALE - GRID_LINE_WIDTH,
        height: CANVAS_SCALE - GRID_LINE_WIDTH,
        strokeWidth: GRID_LINE_WIDTH
    });
}

function drawStickMap()
{
    drawX = -DISPLAY_RADIUS;
    drawY = -DISPLAY_RADIUS;
    requestAnimationFrame(drawFrame);
}

function drawFrame(timestamp)
{
    while (drawX <= DISPLAY_RADIUS) {
        while (drawY <= DISPLAY_RADIUS) {
            drawCoordinate(drawX, drawY);
            drawY++;

            // Defer to next frame if taking too long
            if (performance.now() - timestamp > 1000 / MINIMUM_FRAMERATE) {
                requestAnimationFrame(drawFrame);
                return;
            }
        }

        drawX++;
        drawY = -DISPLAY_RADIUS;
    }

    if (loading) {
        let loadingScreen = $("#loading-screen");
        loading = false;
        loadingScreen.css("pointer-events", "none");
        loadingScreen.animate({opacity: 0.0}, 100, loadingScreen.remove);
    }
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
    let minRegionListWidth = emToPixels(body, 30);
    let minRegionListHeight = emToPixels(body, 25);

    function updateVerticalMode()
    {
        let windowWidth = window.innerWidth;
        let windowHeight = window.innerHeight;
        let canvasSizeHorz = Math.min(windowHeight, windowWidth  - minRegionListWidth);
        let canvasSizeVert = Math.min(windowWidth,  windowHeight - minRegionListHeight);
        let canvasSize = Math.max(canvasSizeHorz, canvasSizeVert);
        let minCanvasSize = Math.min(MIN_CANVAS_SIZE, Math.min(windowWidth, windowHeight));
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
        let canvasScale = canvasSize / CANVAS_SIZE;
        let squareSize = Math.round((CANVAS_SCALE - GRID_LINE_WIDTH * 2) * canvasScale);
        coordinateSquare.css("width", squareSize);
        coordinateSquare.css("height", squareSize);

        if (canvasSizeHorz >= canvasSizeVert) {
            // Horizontal
            pageContainer.css("flex-direction", "row");
            body.addClass("horizontal");
            body.removeClass("vertical");
        } else {
            // Vertical
            pageContainer.css("flex-direction", "column-reverse");
            body.removeClass("horizontal");
            body.addClass("vertical");
        }
    }

    function updateCoordinateDisplay()
    {
        let scale = canvas.innerHeight() / CANVAS_SIZE;

        let unclampedX = Math.floor(mouseX / scale / CANVAS_SCALE - DISPLAY_RADIUS);
        let unclampedY = Math.ceil(DISPLAY_RADIUS - mouseY / scale / CANVAS_SCALE);
        let [x, y] = clampCoordinates(unclampedX, unclampedY);

        coordinateText.text(formatCoordinate(x, y));

        let [color] = getCoordinateStyle(x, y);
        coordinateSquare.css("background-color", color);

        let pixelX = (x + DISPLAY_RADIUS) * CANVAS_SCALE + GRID_LINE_WIDTH * 2;
        let pixelY = (DISPLAY_RADIUS - y) * CANVAS_SCALE + GRID_LINE_WIDTH * 2;
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

    updateVerticalMode();
    drawStickMap();
    addRegion();
});