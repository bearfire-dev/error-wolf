import { HuntClient } from "./hunt-client"

export default function HuntPage() {
  return (
    <div className="pb-16 pt-6 sm:pb-24 sm:pt-8">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <HuntClient />
        </div>
      </div>
    </div>
  )
}
