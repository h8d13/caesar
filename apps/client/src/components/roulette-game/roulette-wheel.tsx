import {
    useRouletteLightningNumbers,
    useRoulettePhase,
    useRouletteWinningNumber
} from '@/features/server/roulette/hooks';
import { cn } from '@/lib/utils';
import { RoulettePhase } from '@sharkord/shared/games/roulette';
import { Zap } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { getNumberColor, WHEEL_ORDER } from './constants';

const LightningDisplay = memo(() => {
    const lightningNumbers = useRouletteLightningNumbers();

    if (lightningNumbers.length === 0) return null;

    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1 text-yellow-400">
                <Zap className="size-4 fill-yellow-400" />
                <span className="text-xs font-bold uppercase tracking-wider">
                    Lightning
                </span>
                <Zap className="size-4 fill-yellow-400" />
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
                {lightningNumbers.map((ln) => {
                    const color = getNumberColor(ln.number);
                    return (
                        <div
                            key={ln.number}
                            className="flex flex-col items-center"
                        >
                            <div
                                className={cn(
                                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-yellow-400/60 shadow-[0_0_12px_rgba(250,204,21,0.4)]',
                                    color === 'red' && 'bg-red-700',
                                    color === 'black' && 'bg-zinc-800',
                                    color === 'green' && 'bg-green-700'
                                )}
                            >
                                {ln.number}
                            </div>
                            <span className="text-[10px] font-bold text-yellow-400 tabular-nums">
                                {ln.multiplier}x
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

const SEGMENT_ANGLE = 360 / 37;

const RouletteWheel = memo(() => {
    const phase = useRoulettePhase();
    const winningNumber = useRouletteWinningNumber();
    const [rotation, setRotation] = useState(0);
    const baseRotationRef = useRef(0);
    const hasSpunRef = useRef(false);

    useEffect(() => {
        if (
            phase === RoulettePhase.SPINNING &&
            winningNumber !== null &&
            !hasSpunRef.current
        ) {
            hasSpunRef.current = true;
            const winIndex = WHEEL_ORDER.indexOf(winningNumber);
            const segmentCenter = winIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
            // Where the wheel currently sits (mod 360)
            const currentOffset = ((baseRotationRef.current % 360) + 360) % 360;
            // How far we need to rotate to land on the target
            const targetOffset = (360 - segmentCenter + 360) % 360;
            // Delta to get from current position to target, plus 5 full spins
            let delta = targetOffset - currentOffset;
            if (delta < 0) delta += 360;
            const targetRotation = baseRotationRef.current + 360 * 5 + delta;
            setRotation(targetRotation);
            baseRotationRef.current = targetRotation;
        } else if (phase === RoulettePhase.BETTING) {
            hasSpunRef.current = false;
        }
    }, [phase, winningNumber]);

    const gradientStops = WHEEL_ORDER.map((num, i) => {
        const color = getNumberColor(num);
        const cssColor =
            color === 'red'
                ? '#dc2626'
                : color === 'black'
                  ? '#1a1a2e'
                  : '#16a34a';
        const startTurn = i / 37;
        const endTurn = (i + 1) / 37;
        return `${cssColor} ${startTurn}turn ${endTurn}turn`;
    }).join(', ');

    const isSpinning = phase === RoulettePhase.SPINNING;
    const isResult = phase === RoulettePhase.RESULT;

    return (
        <div className="flex flex-col items-center gap-1">
            {/* Pointer */}
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[12px] border-l-transparent border-r-transparent border-t-yellow-400 z-10" />

            {/* Wheel container */}
            <div className="relative -mt-1 w-48 h-48">
                <div
                    className="w-full h-full rounded-full border-4 border-yellow-400/50 shadow-lg"
                    style={{
                        background: `conic-gradient(from 0deg, ${gradientStops})`,
                        transform: `rotate(${rotation}deg)`,
                        transition: isSpinning
                            ? 'transform 6s cubic-bezier(0.2, 0.8, 0.3, 1)'
                            : 'none'
                    }}
                >
                    {/* Numbers */}
                    {WHEEL_ORDER.map((num, i) => {
                        const deg = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
                        return (
                            <div
                                key={num}
                                className="absolute inset-0 flex justify-center"
                                style={{
                                    transform: `rotate(${deg}deg)`
                                }}
                            >
                                <span className="text-[7px] font-bold text-white mt-2 select-none">
                                    {num}
                                </span>
                            </div>
                        );
                    })}

                    {/* Center hub */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-background border-2 border-yellow-400/50" />
                    </div>
                </div>
            </div>

            {/* Winning number display */}
            <div
                className={cn(
                    'text-lg font-bold tabular-nums mt-1',
                    isResult && winningNumber !== null
                        ? getNumberColor(winningNumber) === 'red'
                            ? 'text-red-500'
                            : getNumberColor(winningNumber) === 'green'
                              ? 'text-green-500'
                              : 'text-foreground'
                        : 'text-muted-foreground'
                )}
            >
                {isResult && winningNumber !== null
                    ? winningNumber
                    : isSpinning
                      ? 'Spinning...'
                      : 'Place your bets'}
            </div>
        </div>
    );
});

export { LightningDisplay, RouletteWheel };
