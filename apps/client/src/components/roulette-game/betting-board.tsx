import {
    useRouletteBets,
    useRouletteLightningNumbers,
    useRoulettePhase
} from '@/features/server/roulette/hooks';
import { cn } from '@/lib/utils';
import {
    RouletteBetType,
    RoulettePhase
} from '@sharkord/shared/games/roulette';
import { Zap } from 'lucide-react';
import { memo, useCallback, useContext } from 'react';
import { ChipAmountContext } from './chip-amount-context';
import { BOARD_ROWS, getNumberColor } from './constants';

type TBoardCellProps = {
    label: string;
    color?: 'red' | 'black' | 'green' | 'none';
    onClick: () => void;
    disabled: boolean;
    hasChip: boolean;
    className?: string;
    lightningMultiplier?: number;
};

const BoardCell = memo(
    ({
        label,
        color = 'none',
        onClick,
        disabled,
        hasChip,
        className,
        lightningMultiplier
    }: TBoardCellProps) => {
        const isLightning = !!lightningMultiplier;
        const bgColor = isLightning
            ? 'bg-yellow-900/80 hover:bg-yellow-800/80'
            : color === 'red'
              ? 'bg-red-700 hover:bg-red-600'
              : color === 'black'
                ? 'bg-zinc-800 hover:bg-zinc-700'
                : color === 'green'
                  ? 'bg-green-700 hover:bg-green-600'
                  : 'bg-zinc-900 hover:bg-zinc-800';

        return (
            <button
                onClick={onClick}
                disabled={disabled}
                className={cn(
                    'relative flex items-center justify-center border text-xs font-bold text-white transition-colors min-h-[32px]',
                    isLightning
                        ? 'border-yellow-400/60 shadow-[inset_0_0_8px_rgba(250,204,21,0.2)]'
                        : 'border-zinc-600',
                    bgColor,
                    disabled && 'opacity-50 cursor-not-allowed',
                    className
                )}
            >
                <span className="flex flex-col items-center leading-tight">
                    {label}
                    {isLightning && (
                        <span className="flex items-center gap-0.5 text-yellow-400 text-[8px]">
                            <Zap className="size-2 fill-yellow-400" />
                            {lightningMultiplier}x
                        </span>
                    )}
                </span>
                {hasChip && (
                    <div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-600" />
                )}
            </button>
        );
    }
);

const BettingBoard = memo(() => {
    const phase = useRoulettePhase();
    const bets = useRouletteBets();
    const lightningNumbers = useRouletteLightningNumbers();
    const chipAmount = useContext(ChipAmountContext);
    const disabled = phase !== RoulettePhase.BETTING;

    const getLightningMultiplier = useCallback(
        (num: number) =>
            lightningNumbers.find((ln) => ln.number === num)?.multiplier,
        [lightningNumbers]
    );

    const hasBetOn = useCallback(
        (betType: RouletteBetType, betValue: number | null) => {
            return bets.some(
                (b) => b.betType === betType && b.betValue === betValue
            );
        },
        [bets]
    );

    const onPlaceBet = useCallback(
        async (betType: RouletteBetType, betValue: number | null) => {
            if (disabled || !chipAmount) return;
            const { placeRouletteBet } =
                await import('@/features/server/roulette/actions');
            try {
                await placeRouletteBet(betType, betValue, chipAmount);
            } catch (e) {
                const { toast } = await import('sonner');
                toast.error(
                    e instanceof Error ? e.message : 'Failed to place bet'
                );
            }
        },
        [disabled, chipAmount]
    );

    const columnBetTypes = [
        RouletteBetType.COLUMN_3,
        RouletteBetType.COLUMN_2,
        RouletteBetType.COLUMN_1
    ];

    return (
        <div className="px-4 overflow-x-auto">
            <div className="min-w-[480px]">
                {/* Main grid: zero | numbers | 2:1 column bets */}
                <div className="grid grid-cols-[40px_1fr_40px]">
                    {/* Zero - spans all 3 rows */}
                    <BoardCell
                        label="0"
                        color="green"
                        onClick={() => onPlaceBet(RouletteBetType.STRAIGHT, 0)}
                        disabled={disabled}
                        hasChip={hasBetOn(RouletteBetType.STRAIGHT, 0)}
                        className="row-span-3 h-full"
                    />
                    {/* Numbers + 2:1 for each row */}
                    {BOARD_ROWS.map((row, rowIndex) => (
                        <>
                            <div
                                key={`row-${rowIndex}`}
                                className="grid grid-cols-12"
                            >
                                {row.map((num) => (
                                    <BoardCell
                                        key={num}
                                        label={String(num)}
                                        color={getNumberColor(num)}
                                        onClick={() =>
                                            onPlaceBet(
                                                RouletteBetType.STRAIGHT,
                                                num
                                            )
                                        }
                                        disabled={disabled}
                                        hasChip={hasBetOn(
                                            RouletteBetType.STRAIGHT,
                                            num
                                        )}
                                        lightningMultiplier={getLightningMultiplier(
                                            num
                                        )}
                                    />
                                ))}
                            </div>
                            <BoardCell
                                key={`col-${rowIndex}`}
                                label="← 3:1"
                                onClick={() =>
                                    onPlaceBet(columnBetTypes[rowIndex]!, null)
                                }
                                disabled={disabled}
                                hasChip={hasBetOn(
                                    columnBetTypes[rowIndex]!,
                                    null
                                )}
                            />
                        </>
                    ))}
                </div>

                {/* Dozen bets - spans full width including 2:1 column */}
                <div className="grid grid-cols-[40px_1fr]">
                    <div />
                    <div className="grid grid-cols-3">
                        <BoardCell
                            label="1st"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.DOZEN_1, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.DOZEN_1, null)}
                        />
                        <BoardCell
                            label="2nd"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.DOZEN_2, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.DOZEN_2, null)}
                        />
                        <BoardCell
                            label="3rd"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.DOZEN_3, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.DOZEN_3, null)}
                        />
                    </div>
                </div>

                {/* Outside bets: Low/Even/Red/Black/Odd/High */}
                <div className="grid grid-cols-[40px_1fr]">
                    <div />
                    <div className="grid grid-cols-6">
                        <BoardCell
                            label="1-18"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.LOW, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.LOW, null)}
                        />
                        <BoardCell
                            label="EVEN"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.EVEN, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.EVEN, null)}
                        />
                        <BoardCell
                            label="RED"
                            color="red"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.RED, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.RED, null)}
                        />
                        <BoardCell
                            label="BLACK"
                            color="black"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.BLACK, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.BLACK, null)}
                        />
                        <BoardCell
                            label="ODD"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.ODD, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.ODD, null)}
                        />
                        <BoardCell
                            label="19-36"
                            onClick={() =>
                                onPlaceBet(RouletteBetType.HIGH, null)
                            }
                            disabled={disabled}
                            hasChip={hasBetOn(RouletteBetType.HIGH, null)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

export { BettingBoard };
