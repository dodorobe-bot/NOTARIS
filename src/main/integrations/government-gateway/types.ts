export type GovernmentAgencyCode = 'AHU' | 'BPN'

export interface SubmissionState {
  dataFields: number
  supportingFiles: number
  evidenceFiles: number
  resultFiles: number
  externalRef: string | null
  officialStatus: string | null
}

export interface GovernmentAdapter {
  readonly agency: GovernmentAgencyCode
  readonly label: string
  readonly portalUrl: string
  /** Selalu false: tidak ada API resmi yang diverifikasi untuk kantor ini. */
  readonly officialApiAvailable: boolean
  /** Hanya membuka portal resmi; pengisian dan pengajuan tetap dilakukan manusia. */
  readonly automatedSubmission: boolean
  checklist(serviceCode: string): string[]
  note(): string
}

export interface AdapterContext {
  serviceCode: string
  agency: GovernmentAgencyCode
}
