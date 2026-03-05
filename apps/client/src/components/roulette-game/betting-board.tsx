import {
    useRouletteBets,
    useRoulettePhase
} from '@/features/server/roulette/hooks';
import { cn } from '@/lib/utils';
import { RouletteBetType, RoulettePhase } from '@sharkord/shared/games/roulette';
import { memo, useCallback, useContext } from 'react';
import { BOARD_ROWS, getNumberColor } from './constants';
import { ChipAmountContext } from './bet-controls';

type TBoardCellProps = {
    label: string;
    color?: 'red' | 'black' | 'green' | 'none';
    onClick: () => void;
    disabled: boolean;
    hasChip: boolean;
    className?: string;
};

const BoardCell = memo(
    ({ label, color = 'none', onClick, disabled, hasChip, className }: TBoardCellProps) => {
        const bgColor =
            color === 'red'
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
                    'relative flex items-center justify-center border border-zinc-600 text-xs font-bold text-white transition-colors min-h-[32px]',
                    bgColor,
                    disabled && 'opacity-50 cursor-not-allowed',
                    className
                )}
            >
                {label}
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
    const chipAmount = useContext(ChipAmountContext);
    const disabled = phase !== RoulettePhase.BETTING;

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
            const { placeRouletteBet } = await import(
                '@/features/server/roulette/actions'
            );
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

    const columnBetTypes = [RouletteBetType.COLUMN_3, RouletteBetType.COLUMN_2, RouletteBetType.COLUMN_1];

    return (
        <div className="px-4 overflow-x-auto">
            <div className="min-w-[480px]">
                {/* Main grid: zero | numbers | 2:1 column bets */}
                <div className="grid grid-cols-[40px_1fr_40px]">
                    {/* Zero - spans all 3 rows */}
                    <BoardCell
                        label="0"
                        color="green"
                        onClick={() =>
                            onPlaceBet(RouletteBetType.STRAIGHT, 0)
                        }
                        disabled={disabled}
                        hasChip={hasBetOn(RouletteBetType.STRAIGHT, 0)}
                        className="row-span-3 h-full"
                    />
                    {/* Numbers + 2:1 for each row */}
                    {BOARD_ROWS.map((row, rowIndex) => (
                        <>
                            <div key={`row-${rowIndex}`} className="grid grid-cols-12">
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
                                hasChip={hasBetOn(columnBetTypes[rowIndex]!, null)}
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
