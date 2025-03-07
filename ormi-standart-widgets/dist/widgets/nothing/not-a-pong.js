var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { GamepadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
function NotAPong(props) {
    // refs for container & moving elements
    // refs for container & moving elements
    var containerRef = useRef(null);
    var playerRef = useRef(null);
    var aiRef = useRef(null);
    var ballRef = useRef(null);
    // fixed game element sizes
    var paddleWidth = 10;
    var paddleHeight = 80;
    var ballRadius = 8;
    // Score state – AI is left, Player is right.
    var _a = useState(0), aiScore = _a[0], setAiScore = _a[1];
    var _b = useState(0), playerScore = _b[0], setPlayerScore = _b[1];
    useEffect(function () {
        // initial positions (will be updated using current container dimensions)
        var playerPaddleY = 0;
        var aiPaddleY = 0;
        var ballX = 0;
        var ballY = 0;
        // Increase ball speed from 4 to 6
        var ballSpeedX = 4;
        var ballSpeedY = 4;
        var paddleSpeed = 5;
        var aiSpeed = 8;
        var upPressed = false;
        var downPressed = false;
        var paused = false; // pause flag for delay
        // Use getBoundingClientRect for dynamic container dimensions
        var getDimensions = function () {
            var _a;
            var rect = (_a = containerRef.current) === null || _a === void 0 ? void 0 : _a.getBoundingClientRect();
            return {
                cw: (rect === null || rect === void 0 ? void 0 : rect.width) || 600,
                ch: (rect === null || rect === void 0 ? void 0 : rect.height) || 400
            };
        };
        // initialize positions based on container dimensions
        var initPositions = function () {
            var _a = getDimensions(), cw = _a.cw, ch = _a.ch;
            playerPaddleY = (ch - paddleHeight) / 2;
            aiPaddleY = (ch - paddleHeight) / 2;
            ballX = cw / 2;
            ballY = ch / 2;
        };
        initPositions();
        var resetBall = function () {
            var _a = getDimensions(), cw = _a.cw, ch = _a.ch;
            ballX = cw / 2;
            ballY = ch / 2;
            // Randomize initial direction
            ballSpeedX = 6 * (Math.random() > 0.5 ? 1 : -1);
            ballSpeedY = 6;
        };
        var keyDownHandler = function (e) {
            if (e.key === 'ArrowUp')
                upPressed = true;
            else if (e.key === 'ArrowDown')
                downPressed = true;
        };
        var keyUpHandler = function (e) {
            if (e.key === 'ArrowUp')
                upPressed = false;
            else if (e.key === 'ArrowDown')
                downPressed = false;
        };
        window.addEventListener("keydown", keyDownHandler);
        window.addEventListener("keyup", keyUpHandler);
        // Add resize handler to recalc positions on resize
        var handleResize = function () {
            initPositions();
            updateElements();
        };
        window.addEventListener("resize", handleResize);
        // Add mouse control if enabled
        var mouseMoveHandler = null;
        if (props.mouseControl && containerRef.current) {
            mouseMoveHandler = function (e) {
                var rect = containerRef.current.getBoundingClientRect();
                var newY = e.clientY - rect.top - paddleHeight / 2;
                var ch = getDimensions().ch;
                if (newY < 0)
                    newY = 0;
                else if (newY > ch - paddleHeight)
                    newY = ch - paddleHeight;
                playerPaddleY = newY;
            };
            containerRef.current.addEventListener("mousemove", mouseMoveHandler);
        }
        // update element positions from game variables, swapping paddle positions:
        // AI paddle on left, player paddle on right.
        var updateElements = function () {
            var cw = getDimensions().cw;
            if (aiRef.current) {
                aiRef.current.style.top = aiPaddleY + "px";
                aiRef.current.style.left = "10px";
            }
            if (playerRef.current) {
                playerRef.current.style.top = playerPaddleY + "px";
                playerRef.current.style.left = (cw - paddleWidth - 10) + "px";
            }
            if (ballRef.current) {
                ballRef.current.style.left = ballX - ballRadius + "px";
                ballRef.current.style.top = ballY - ballRadius + "px";
            }
        };
        var update = function (delta) {
            if (paused) {
                return updateElements();
            }
            var _a = getDimensions(), cw = _a.cw, ch = _a.ch;
            var factor = delta / 16.67; // base delta for ~60fps
            // Update player paddle:
            if (!props.aiVsAi) {
                // Human-controlled: use key input
                if (upPressed && playerPaddleY > 0) {
                    playerPaddleY -= paddleSpeed * factor;
                }
                if (downPressed && playerPaddleY < ch - paddleHeight) {
                    playerPaddleY += paddleSpeed * factor;
                }
            }
            else {
                // AI vs AI: player paddle AI logic (mirrors left but reversed)
                var targetPlayerPaddleY = 0;
                if (ballSpeedX < 0) {
                    // Ball moving away from right paddle: return to center
                    targetPlayerPaddleY = (ch - paddleHeight) / 2;
                }
                else {
                    // Ball coming towards right paddle: predict impact
                    var targetX = cw - paddleWidth - 10 - ballRadius;
                    var distanceX = targetX - ballX;
                    var timeToHit = Math.abs(distanceX / ballSpeedX);
                    var predictedY = ballY;
                    var vy = ballSpeedY;
                    var remainingTime = timeToHit;
                    while (remainingTime > 0) {
                        if (vy > 0) {
                            var timeToBottom = (ch - ballRadius - predictedY) / vy;
                            if (timeToBottom < remainingTime) {
                                predictedY = ch - ballRadius;
                                vy = -vy;
                                remainingTime -= timeToBottom;
                            }
                            else {
                                predictedY += vy * remainingTime;
                                remainingTime = 0;
                            }
                        }
                        else {
                            var timeToTop = (predictedY - ballRadius) / Math.abs(vy);
                            if (timeToTop < remainingTime) {
                                predictedY = ballRadius;
                                vy = -vy;
                                remainingTime -= timeToTop;
                            }
                            else {
                                predictedY += vy * remainingTime;
                                remainingTime = 0;
                            }
                        }
                    }
                    targetPlayerPaddleY = predictedY - paddleHeight / 2;
                }
                if (targetPlayerPaddleY < 0)
                    targetPlayerPaddleY = 0;
                if (targetPlayerPaddleY > ch - paddleHeight)
                    targetPlayerPaddleY = ch - paddleHeight;
                var diffP = targetPlayerPaddleY - playerPaddleY;
                var maxMoveP = aiSpeed * factor;
                if (Math.abs(diffP) > maxMoveP) {
                    playerPaddleY += maxMoveP * Math.sign(diffP);
                }
                else {
                    playerPaddleY = targetPlayerPaddleY;
                }
            }
            // Move ball
            ballX += ballSpeedX * factor;
            ballY += ballSpeedY * factor;
            // Bounce off top/bottom boundaries
            if (ballY - ballRadius < 0) {
                ballSpeedY = Math.abs(ballSpeedY);
                ballY = ballRadius;
            }
            else if (ballY + ballRadius > ch) {
                ballSpeedY = -Math.abs(ballSpeedY);
                ballY = ch - ballRadius;
            }
            // Score conditions for missing the paddles:
            if (ballX - ballRadius < 0) {
                // Ball passed left wall – player scores
                setPlayerScore(function (prev) { return prev + 1; });
                paused = true;
                updateElements();
                setTimeout(function () { resetBall(); paused = false; }, 500);
                return;
            }
            else if (ballX + ballRadius > cw) {
                // Ball passed right wall – AI scores
                setAiScore(function (prev) { return prev + 1; });
                paused = true;
                updateElements();
                setTimeout(function () { resetBall(); paused = false; }, 500);
                return;
            }
            // Paddle collisions
            // AI paddle (left)
            if (ballX - ballRadius < 10 + paddleWidth &&
                ballY > aiPaddleY &&
                ballY < aiPaddleY + paddleHeight) {
                ballSpeedX = Math.abs(ballSpeedX) * 1.1;
                ballSpeedY = ballSpeedY * 1.1;
                ballX = 10 + paddleWidth + ballRadius;
            }
            // Player paddle (right)
            if (ballX + ballRadius > cw - paddleWidth - 10 &&
                ballY > playerPaddleY &&
                ballY < playerPaddleY + paddleHeight) {
                ballSpeedX = -Math.abs(ballSpeedX) * 1.1;
                ballSpeedY = ballSpeedY * 1.1;
                ballX = cw - paddleWidth - 10 - ballRadius;
            }
            // AI paddle logic:
            var targetAIPaddleY = 0;
            if (ballSpeedX > 0) {
                // Ball going towards player: return to center
                targetAIPaddleY = (ch - paddleHeight) / 2;
            }
            else {
                // Ball heading towards AI: predict impact position
                var targetX = 10 + paddleWidth + ballRadius;
                var distanceX = ballX - targetX;
                var timeToHit = Math.abs(distanceX / ballSpeedX);
                var predictedY = ballY;
                var vy = ballSpeedY;
                var remainingTime = timeToHit;
                // Simulate vertical bounces
                while (remainingTime > 0) {
                    if (vy > 0) {
                        var timeToBottom = (ch - ballRadius - predictedY) / vy;
                        if (timeToBottom < remainingTime) {
                            predictedY = ch - ballRadius;
                            vy = -vy;
                            remainingTime -= timeToBottom;
                        }
                        else {
                            predictedY += vy * remainingTime;
                            remainingTime = 0;
                        }
                    }
                    else {
                        var timeToTop = (predictedY - ballRadius) / Math.abs(vy);
                        if (timeToTop < remainingTime) {
                            predictedY = ballRadius;
                            vy = -vy;
                            remainingTime -= timeToTop;
                        }
                        else {
                            predictedY += vy * remainingTime;
                            remainingTime = 0;
                        }
                    }
                }
                // Align paddle center to predicted impact (and clamp)
                targetAIPaddleY = predictedY - paddleHeight / 2;
            }
            // Clamp target position
            if (targetAIPaddleY < 0)
                targetAIPaddleY = 0;
            if (targetAIPaddleY > ch - paddleHeight)
                targetAIPaddleY = ch - paddleHeight;
            // Smoothly move AI paddle at a max increment per frame
            var diff = targetAIPaddleY - aiPaddleY;
            var maxMove = aiSpeed * factor;
            if (Math.abs(diff) > maxMove) {
                aiPaddleY += maxMove * Math.sign(diff);
            }
            else {
                aiPaddleY = targetAIPaddleY;
            }
            updateElements();
        };
        var animationFrameId;
        var lastTime = null;
        var gameLoop = function (timestamp) {
            if (lastTime === null)
                lastTime = timestamp;
            var delta = timestamp - lastTime;
            lastTime = timestamp;
            update(delta);
            animationFrameId = requestAnimationFrame(gameLoop);
        };
        animationFrameId = requestAnimationFrame(gameLoop);
        return function () {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener("keydown", keyDownHandler);
            window.removeEventListener("keyup", keyUpHandler);
            window.removeEventListener("resize", handleResize);
            if (mouseMoveHandler && containerRef.current) {
                containerRef.current.removeEventListener("mousemove", mouseMoveHandler);
            }
        };
    }, [props.mouseControl, props.aiVsAi]);
    return (
    // Container set to fill parent's dimensions responsively
    _jsxs("div", { ref: containerRef, style: {
            width: "100%",
            height: "100%",
            position: "relative",
            background: "black",
            overflow: "hidden"
        }, children: [_jsxs("div", { style: {
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "white",
                    fontSize: "36px",
                    fontFamily: "'Press Start 2P', monospace",
                    zIndex: 1
                }, children: [aiScore, " : ", playerScore] }), _jsx("div", { ref: playerRef, style: {
                    width: "10px",
                    height: "80px",
                    background: "white",
                    position: "absolute",
                    top: "0px",
                    right: "0px"
                } }), _jsx("div", { ref: aiRef, style: {
                    width: "10px",
                    height: "80px",
                    background: "white", position: "absolute", top: "0px"
                } }), "            ", "            ", _jsx("div", { ref: ballRef, style: {
                    width: ballRadius * 2 + "px", height: ballRadius * 2 + "px",
                    background: "white",
                    position: "absolute",
                    borderRadius: "50%",
                    left: "0px",
                    top: "0px"
                } })] }));
}
export function NotAPongDefinition() {
    return {
        id: 'not-a-pong',
        name: 'Not a Pong Game',
        description: 'Definitly not Pong',
        titleProp: 'title',
        icon: _jsx(GamepadIcon, {}),
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                mouseControl: {
                    type: 'boolean',
                    title: 'Mouse control'
                },
                aiVsAi: {
                    type: 'boolean',
                    title: 'AI vs AI'
                }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                },
                {
                    type: "Control",
                    scope: "#/properties/mouseControl",
                },
                {
                    type: "Control",
                    scope: "#/properties/aiVsAi",
                }
            ]
        },
        data: {
            title: 'Ooops',
        },
        Component: function (data) { return (_jsx(NotAPong, __assign({}, data))); }
    };
}
