import { ChevronDown, ChevronUp } from 'lucide-react';
import { MAX_WEIGHT_LB, stepWeight } from '@/lib/weight-step';

type Props = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  className: string;
  testId: string;
};

export function WeightInput({ id, value, onValueChange, className, testId }: Props) {
  const move = (direction: 1 | -1) => onValueChange(stepWeight(value, direction));
  const arrowClass = 'flex flex-1 items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        required
        min={0}
        max={MAX_WEIGHT_LB}
        step="0.01"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            move(event.key === 'ArrowUp' ? 1 : -1);
          }
        }}
        placeholder="135"
        className={`${className} pr-11 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        data-testid={testId}
      />
      {/* Separate arrow movement from the browser's decimal validation step. */}
      <div className="absolute inset-y-0 right-0 flex w-10 flex-col overflow-hidden rounded-r-sm border-l border-white/10">
        <button
          type="button"
          className={arrowClass}
          onClick={() => move(1)}
          disabled={Number(value) >= MAX_WEIGHT_LB}
          aria-label="Increase weight by 1 pound"
          aria-controls={id}
          title="Increase by 1 lb"
          data-testid={`${testId}-increase`}
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={arrowClass}
          onClick={() => move(-1)}
          disabled={Number(value) <= 0}
          aria-label="Decrease weight by 1 pound"
          aria-controls={id}
          title="Decrease by 1 lb"
          data-testid={`${testId}-decrease`}
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
