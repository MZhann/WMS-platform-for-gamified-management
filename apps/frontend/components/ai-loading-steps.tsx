"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Sparkles } from "lucide-react"

interface AiLoadingStepsProps {
  steps: string[]
  intervalMs?: number
}

export function AiLoadingSteps({ steps, intervalMs = 3000 }: AiLoadingStepsProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (steps.length <= 1) return
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [steps.length, intervalMs])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary/30 border-t-primary" />
        <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-primary animate-pulse" />
      </div>
      <div className="text-center space-y-2 min-h-[3rem]">
        <p className="text-sm font-medium text-foreground animate-in fade-in slide-in-from-bottom-2 duration-300" key={currentStep}>
          {t(steps[currentStep])}
        </p>
        <div className="flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i <= currentStep
                  ? "w-4 bg-primary"
                  : "w-1.5 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
