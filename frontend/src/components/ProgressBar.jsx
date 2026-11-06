export default function ProgressBar({ steps, current }) {
  return (
    <div className="progress-steps">
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < current;
        const isActive = stepNum === current;
        return (
          <div key={idx} className="progress-step-wrapper">
            <div className={`progress-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}>
              <div className="step-circle">
                {isCompleted ? '✓' : stepNum}
              </div>
              <span className="step-label">{step}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`step-connector ${isCompleted ? 'completed' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
