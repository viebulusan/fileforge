import {
  acceptsImage,
  convertImage,
  outputsFor,
  extOf,
  baseOf,
} from './images.js'
import {
  acceptsDocs,
  convertDocs,
  outputsForDocs,
  docsExtOf as extOfDocs,
  docsBaseOf as baseOfDocs,
} from './docs.js'
import {
  acceptsAv,
  convertAv,
  outputsForAv,
  extOfAv as extOfAvFn,
  baseOfAv as baseOfAvFn,
} from './av.js'

export const families = [
  {
    id: 'image',
    label: 'Image',
    accepts: acceptsImage,
    outputsFor,
    convert: convertImage,
    extOf,
    baseOf,
  },
  {
    id: 'docs',
    label: 'Document',
    accepts: acceptsDocs,
    outputsFor: outputsForDocs,
    convert: convertDocs,
    extOf: extOfDocs,
    baseOf: baseOfDocs,
  },
  {
    id: 'av',
    label: 'Audio / Video',
    accepts: acceptsAv,
    outputsFor: outputsForAv,
    convert: convertAv,
    extOf: extOfAvFn,
    baseOf: baseOfAvFn,
  },
]

export function planFor(file) {
  return families.find((family) => family.accepts(file)) ?? null
}
