import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { GamepadIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

/** Props for NotAPong. */
interface NotAPongProps extends Record<string, unknown> {
	title: string;
	mouseControl?: boolean;
	aiVsAi?: boolean;
}

/**
 * Not-a-pong mini game widget body.
 * @param props - Component props.
 * @returns React element.
 */
function NotAPong(props: NotAPongProps) {
	// refs for container & moving elements
	// refs for container & moving elements
	const containerRef = useRef<HTMLDivElement>(null);
	const playerRef = useRef<HTMLDivElement>(null);
	const aiRef = useRef<HTMLDivElement>(null);
	const ballRef = useRef<HTMLDivElement>(null);

	// fixed game element sizes
	const paddleWidth = 10;
	const paddleHeight = 80;
	const ballRadius = 8;

	// Score state – AI is left, Player is right.
	const [aiScore, setAiScore] = useState(0);
	const [playerScore, setPlayerScore] = useState(0);

	useEffect(() => {
		// initial positions (will be updated using current container dimensions)
		let playerPaddleY = 0;
		let aiPaddleY = 0;
		let ballX = 0;
		let ballY = 0;
		// Increase ball speed from 4 to 6
		let ballSpeedX = 4;
		let ballSpeedY = 4;
		const paddleSpeed = 5;
		const aiSpeed = 8;
		let upPressed = false;
		let downPressed = false;
		let paused = false; // pause flag for delay

		// Use getBoundingClientRect for dynamic container dimensions
		const getDimensions = () => {
			const rect = containerRef.current?.getBoundingClientRect();
			return {
				cw: rect?.width || 600,
				ch: rect?.height || 400,
			};
		};

		// initialize positions based on container dimensions
		const initPositions = () => {
			const { cw, ch } = getDimensions();
			playerPaddleY = (ch - paddleHeight) / 2;
			aiPaddleY = (ch - paddleHeight) / 2;
			ballX = cw / 2;
			ballY = ch / 2;
		};
		initPositions();

		const resetBall = () => {
			const { cw, ch } = getDimensions();
			ballX = cw / 2;
			ballY = ch / 2;
			// Randomize initial direction
			ballSpeedX = 6 * (Math.random() > 0.5 ? 1 : -1);
			ballSpeedY = 6;
		};

		const keyDownHandler = (e: KeyboardEvent) => {
			if (e.key === "ArrowUp") upPressed = true;
			else if (e.key === "ArrowDown") downPressed = true;
		};
		const keyUpHandler = (e: KeyboardEvent) => {
			if (e.key === "ArrowUp") upPressed = false;
			else if (e.key === "ArrowDown") downPressed = false;
		};
		window.addEventListener("keydown", keyDownHandler);
		window.addEventListener("keyup", keyUpHandler);

		// Add resize handler to recalc positions on resize
		const handleResize = () => {
			initPositions();
			updateElements();
		};
		window.addEventListener("resize", handleResize);

		// Add mouse control if enabled
		let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
		if (props.mouseControl && containerRef.current) {
			mouseMoveHandler = (e: MouseEvent) => {
				const rect = containerRef.current!.getBoundingClientRect();
				let newY = e.clientY - rect.top - paddleHeight / 2;
				const { ch } = getDimensions();
				if (newY < 0) newY = 0;
				else if (newY > ch - paddleHeight) newY = ch - paddleHeight;
				playerPaddleY = newY;
			};
			containerRef.current.addEventListener(
				"mousemove",
				mouseMoveHandler,
			);
		}

		// update element positions from game variables, swapping paddle positions:
		// AI paddle on left, player paddle on right.
		const updateElements = () => {
			const { cw } = getDimensions();
			if (aiRef.current) {
				aiRef.current.style.top = aiPaddleY + "px";
				aiRef.current.style.left = "10px";
			}
			if (playerRef.current) {
				playerRef.current.style.top = playerPaddleY + "px";
				playerRef.current.style.left = cw - paddleWidth - 10 + "px";
			}
			if (ballRef.current) {
				ballRef.current.style.left = ballX - ballRadius + "px";
				ballRef.current.style.top = ballY - ballRadius + "px";
			}
		};

		const update = (delta: number) => {
			if (paused) {
				return updateElements();
			}
			const { cw, ch } = getDimensions();
			const factor = delta / 16.67; // base delta for ~60fps

			// Update player paddle:
			if (!props.aiVsAi) {
				// Human-controlled: use key input
				if (upPressed && playerPaddleY > 0) {
					playerPaddleY -= paddleSpeed * factor;
				}
				if (downPressed && playerPaddleY < ch - paddleHeight) {
					playerPaddleY += paddleSpeed * factor;
				}
			} else {
				// AI vs AI: player paddle AI logic (mirrors left but reversed)
				let targetPlayerPaddleY = 0;
				if (ballSpeedX < 0) {
					// Ball moving away from right paddle: return to center
					targetPlayerPaddleY = (ch - paddleHeight) / 2;
				} else {
					// Ball coming towards right paddle: predict impact
					const targetX = cw - paddleWidth - 10 - ballRadius;
					const distanceX = targetX - ballX;
					const timeToHit = Math.abs(distanceX / ballSpeedX);
					let predictedY = ballY;
					let vy = ballSpeedY;
					let remainingTime = timeToHit;
					while (remainingTime > 0) {
						if (vy > 0) {
							const timeToBottom =
								(ch - ballRadius - predictedY) / vy;
							if (timeToBottom < remainingTime) {
								predictedY = ch - ballRadius;
								vy = -vy;
								remainingTime -= timeToBottom;
							} else {
								predictedY += vy * remainingTime;
								remainingTime = 0;
							}
						} else {
							const timeToTop =
								(predictedY - ballRadius) / Math.abs(vy);
							if (timeToTop < remainingTime) {
								predictedY = ballRadius;
								vy = -vy;
								remainingTime -= timeToTop;
							} else {
								predictedY += vy * remainingTime;
								remainingTime = 0;
							}
						}
					}
					targetPlayerPaddleY = predictedY - paddleHeight / 2;
				}
				if (targetPlayerPaddleY < 0) targetPlayerPaddleY = 0;
				if (targetPlayerPaddleY > ch - paddleHeight)
					targetPlayerPaddleY = ch - paddleHeight;
				const diffP = targetPlayerPaddleY - playerPaddleY;
				const maxMoveP = aiSpeed * factor;
				if (Math.abs(diffP) > maxMoveP) {
					playerPaddleY += maxMoveP * Math.sign(diffP);
				} else {
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
			} else if (ballY + ballRadius > ch) {
				ballSpeedY = -Math.abs(ballSpeedY);
				ballY = ch - ballRadius;
			}

			// Score conditions for missing the paddles:
			if (ballX - ballRadius < 0) {
				// Ball passed left wall – player scores
				setPlayerScore((prev) => prev + 1);
				paused = true;
				updateElements();
				setTimeout(() => {
					resetBall();
					paused = false;
				}, 500);
				return;
			} else if (ballX + ballRadius > cw) {
				// Ball passed right wall – AI scores
				setAiScore((prev) => prev + 1);
				paused = true;
				updateElements();
				setTimeout(() => {
					resetBall();
					paused = false;
				}, 500);
				return;
			}

			// Paddle collisions
			// AI paddle (left)
			if (
				ballX - ballRadius < 10 + paddleWidth &&
				ballY > aiPaddleY &&
				ballY < aiPaddleY + paddleHeight
			) {
				ballSpeedX = Math.abs(ballSpeedX) * 1.1;
				ballSpeedY = ballSpeedY * 1.1;
				ballX = 10 + paddleWidth + ballRadius;
			}
			// Player paddle (right)
			if (
				ballX + ballRadius > cw - paddleWidth - 10 &&
				ballY > playerPaddleY &&
				ballY < playerPaddleY + paddleHeight
			) {
				ballSpeedX = -Math.abs(ballSpeedX) * 1.1;
				ballSpeedY = ballSpeedY * 1.1;
				ballX = cw - paddleWidth - 10 - ballRadius;
			}

			// AI paddle logic:
			let targetAIPaddleY = 0;
			if (ballSpeedX > 0) {
				// Ball going towards player: return to center
				targetAIPaddleY = (ch - paddleHeight) / 2;
			} else {
				// Ball heading towards AI: predict impact position
				const targetX = 10 + paddleWidth + ballRadius;
				const distanceX = ballX - targetX;
				const timeToHit = Math.abs(distanceX / ballSpeedX);
				let predictedY = ballY;
				let vy = ballSpeedY;
				let remainingTime = timeToHit;
				// Simulate vertical bounces
				while (remainingTime > 0) {
					if (vy > 0) {
						const timeToBottom =
							(ch - ballRadius - predictedY) / vy;
						if (timeToBottom < remainingTime) {
							predictedY = ch - ballRadius;
							vy = -vy;
							remainingTime -= timeToBottom;
						} else {
							predictedY += vy * remainingTime;
							remainingTime = 0;
						}
					} else {
						const timeToTop =
							(predictedY - ballRadius) / Math.abs(vy);
						if (timeToTop < remainingTime) {
							predictedY = ballRadius;
							vy = -vy;
							remainingTime -= timeToTop;
						} else {
							predictedY += vy * remainingTime;
							remainingTime = 0;
						}
					}
				}
				// Align paddle center to predicted impact (and clamp)
				targetAIPaddleY = predictedY - paddleHeight / 2;
			}
			// Clamp target position
			if (targetAIPaddleY < 0) targetAIPaddleY = 0;
			if (targetAIPaddleY > ch - paddleHeight)
				targetAIPaddleY = ch - paddleHeight;
			// Smoothly move AI paddle at a max increment per frame
			const diff = targetAIPaddleY - aiPaddleY;
			const maxMove = aiSpeed * factor;
			if (Math.abs(diff) > maxMove) {
				aiPaddleY += maxMove * Math.sign(diff);
			} else {
				aiPaddleY = targetAIPaddleY;
			}

			updateElements();
		};

		let animationFrameId: number;
		let lastTime: number | null = null;
		const gameLoop = (timestamp: number) => {
			if (lastTime === null) lastTime = timestamp;
			const delta = timestamp - lastTime;
			lastTime = timestamp;
			update(delta);
			animationFrameId = requestAnimationFrame(gameLoop);
		};

		animationFrameId = requestAnimationFrame(gameLoop);
		return () => {
			cancelAnimationFrame(animationFrameId);
			window.removeEventListener("keydown", keyDownHandler);
			window.removeEventListener("keyup", keyUpHandler);
			window.removeEventListener("resize", handleResize);
			if (mouseMoveHandler && containerRef.current) {
				containerRef.current.removeEventListener(
					"mousemove",
					mouseMoveHandler,
				);
			}
		};
	}, [props.mouseControl, props.aiVsAi]);

	return (
		// Container set to fill parent's dimensions responsively
		<div
			ref={containerRef}
			style={{
				width: "100%",
				height: "100%",
				position: "relative",
				background: "black",
				overflow: "hidden",
			}}
		>
			{/* Score Label in center with pixelated style */}
			<div
				style={{
					position: "absolute",
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
					color: "white",
					fontSize: "36px",
					fontFamily: "'Press Start 2P', monospace",
					zIndex: 1,
				}}
			>
				{aiScore} : {playerScore}
			</div>
			{/* Player Paddle (right) */}
			<div
				ref={playerRef}
				style={{
					width: "10px",
					height: "80px",
					background: "white",
					position: "absolute",
					top: "0px",
					right: "0px",
				}}
			></div>
			{/* AI Paddle (left) */}
			<div
				ref={aiRef}
				style={{
					width: "10px",
					height: "80px",
					background: "white",
					position: "absolute",
					top: "0px",
				}}
			></div>{" "}
			{/* Ball */}{" "}
			<div
				ref={ballRef}
				style={{
					width: ballRadius * 2 + "px",
					height: ballRadius * 2 + "px",
					background: "white",
					position: "absolute",
					borderRadius: "50%",
					left: "0px",
					top: "0px",
				}}
			></div>
		</div>
	);
}

/**
 * Widget definition for NotAPong.
 * @returns Widget definition.
 */
export function NotAPongDefinition() {
	return {
		id: "not-a-pong",
		name: "Not a Pong Game",
		description: "Definitly not Pong",
		titleProp: "title",
		icon: <GamepadIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				mouseControl: {
					type: "boolean",
					title: "Mouse control",
				},
				aiVsAi: {
					type: "boolean",
					title: "AI vs AI",
				},
			},
			required: ["title"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/mouseControl",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/aiVsAi",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Ooops",
		},
		Component: NotAPong,
	};
}
