import {
  FC,
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import { ChevronRightIcon, ChevronUpIcon } from '@heroicons/react/20/solid'
import { Popover, Transition } from '@headlessui/react'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { chain, useAccount, useSigner, useConnect } from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors/injected'

import Logo from '@/components/Logo'

import useContracts from '../hooks/use-contracts'
import useLit from '../hooks/use-lit'
import useIPFS from '../hooks/use-ipfs'
import { resolver } from '../utils/async'
import { cidToBytes32, strToUint8, uint8ToStr } from '../utils/bytes'

const reducer = (state: any, action: any) => {
  const { step } = action

  if (step < state.length) {
    const newSteps = [...state]
    newSteps[step].status = 'complete'
    if (step + 1 < state.length) newSteps[step + 1].status = 'current'

    return newSteps
  }

  return state
}

enum StepStatus {
  complete,
  upcoming,
}

type Step = { name: string; href?: string; status: StepStatus }

const blockConfig = [
  {
    children: [
      {
        children: ['Hello!'],
        props: {
          level: ['value', 1],
        },
        type: 'Heading',
      },
      {
        children: [
          'Aenean sodales nunc augue, quis mollis dolor tempor at. Nam interdum, mauris nec commodo rutrum, velit felis tempor dui, vitae elementum massa diam eget nulla. Vivamus rutrum ullamcorper lorem sed sollicitudin. Praesent maximus lorem sed accumsan convallis. Etiam nec risus ac arcu pulvinar placerat. Proin fermentum ligula gravida purus fermentum malesuada. Maecenas condimentum tempor pulvinar.',
        ],
        type: 'Paragraph',
      },
      {
        children: ["Let's go!"],
        props: {
          href: 'https://crcls.xyz',
        },
        type: 'Link',
      },
    ],
    type: 'Container',
  },
]

const StepNav: FC<{ step: Step }> = ({ step }) => {
  const Comp = step.href !== undefined ? 'a' : 'span'

  if (step.status === 'current') {
    return (
      <Comp href={step.href} aria-current="page" className="text-green-600">
        {step.name}
      </Comp>
    )
  } else {
    return <Comp href={step.href}>{step.name}</Comp>
  }
}

interface NFTMetaData {
  description: string
  image: string
  name: string
  buiProperties: {
    cid: string
    encryptedKey: string
    authConditions: Array<{ [key: string]: any }>
  }
}

function generateBlockMeta({
  description,
  blockName,
  image,
  tags,
  cid,
  key,
  authConditions,
}): NFTMetaData {
  return {
    description,
    image,
    name: blockName,
    buiProperties: {
      authConditions,
      cid,
      key,
      tags,
    },
    // TODO: add attributes
  }
}

function serialize(data: FormData): { [key: string]: any } {
  const params: { [key: string]: any } = {}

  for (const pair of data.entries()) {
    params[pair[0]] = pair[1]
  }

  return params
}

function normalizeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
}

const Publish: NextPage = () => {
  const account = useAccount()
  const { connect } = useConnect({
    chain: chain.polygonMumbai.id,
    connector: new InjectedConnector(),
  })
  const { getContract } = useContracts()
  const { data: signer } = useSigner()
  const { createAuthCondition, encryptFile, saveEncryption } = useLit()
  const { addIPFS, addWeb3Storage } = useIPFS()
  const [steps, dispatch] = useReducer<Step[]>(reducer, [
    { name: 'Build', href: '/editor', status: 'complete' },
    { name: 'Metadata', href: '#', status: 'upcoming' },
    { name: 'Mint', href: '#', status: 'upcoming' },
  ])
  const [step, setStep] = useState(1)
  const router = useRouter()
  const [buttonLabel, setButtonlabel] = useState('Continue')
  const [error, setError] = useState<Error | undefined>()
  const formRef = useRef<HTMLFormElement>()
  const [progressMsg, setProgressMsg] = useState('Initializing...')
  const [isMinting, setIsMinting] = useState(false)

  useEffect(() => {
    if (!account.isConnected) {
      connect()
    }
  }, [account, connect])

  const handleContinue = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(undefined)

      if (step === steps.length - 1) {
        setButtonlabel('My Blocks')
      } else if (step === steps.length) {
        await router.push('/marketplace')
      }

      // Need to get this before the dispatch removes the inputs
      const formdata = new FormData(event.currentTarget)

      dispatch({ step })
      setStep(step + 1)

      if (step + 1 === 2) {
        if (!signer) {
          setError(new Error('Please connect your wallet.'))
          setStep(step)
          setIsMinting(false)
          // FIXME: need better step management. No way to revert the dispatch.
          return
        }

        setIsMinting(true)

        const data = strToUint8(JSON.stringify(blockConfig))

        const { encryptedFile, symmetricKey } = await encryptFile(data)
        const [err, cid] = await resolver(addIPFS('block', encryptedFile))
        if (err !== undefined || cid === undefined) {
          console.log('IPFS uplod error')
          setError(err)
          setStep(step)
          setIsMinting(false)
          return
        }

        const cidHash = cidToBytes32(cid)
        const evmContractConditions = [
          createAuthCondition('BUIBlockNFT', 'ownerOfBlock', [
            cidHash,
            ':userAddress',
          ]),
          // TODO: Add LicenseNFT auth condition
          // Verify there is a license with the
          // given CID belonging to the calling
          // authSig.
        ]

        const [eerr, encryptedKey] = await resolver(
          saveEncryption(symmetricKey, evmContractConditions)
        )
        if (eerr !== undefined || encryptedKey === undefined) {
          console.log('lit encryption error')
          setError(eerr)
          setStep(step)
          setIsMinting(false)
          return
        }

        const key = uint8ToStr(encryptedKey, 'base16')

        const image = formdata.get('image-upload')
        formdata.delete('image-upload')

        const formParams = serialize(formdata)

        if (image.size !== 0) {
          console.log(image)
          if (!image.type.startsWith('image')) {
            setError(new Error('Uploaded file is not an image'))
            setStep(step)
            setIsMinting(false)
            return
          }

          setProgressMsg('Uploading metadata...')
          const imgData = image.arrayBuffer()
          const fileName = normalizeName(formdata.get('blockName'))
          const ext = image.type.split('/')[1]
          const file = new File(
            [new Blob([imgData], { type: image.type })],
            `${fileName}.${ext as string}`,
            {
              type: image.type,
            }
          )

          const [uerr, cid] = await resolver(addWeb3Storage([file]))
          if (uerr !== undefined || cid === undefined) {
            setError(new Error('Failed to upload image to Web3.Storage'))
            setStep(step)
            setIsMinting(false)
            return
          }

          formParams.image = `ipfs://${cid}/${fileName}.${ext as string}`
        }

        // TODO: perform validation on input
        const metadata = generateBlockMeta({
          ...formParams,
          cid,
          key,
          authConditions: evmContractConditions,
        })

        console.log(metadata)

        const metaFile = new File(
          [new Blob([JSON.stringify(metadata)], { type: 'application/json' })],
          'metadata.json'
        )

        const [merr, mcid] = await resolver(addWeb3Storage([metaFile]))
        if (merr !== undefined || mcid === undefined) {
          setError(new Error('Failed to upload metadata to Web3.Storage'))
          setStep(step)
          setIsMinting(false)
          return
        }
        const metaURI = `ipfs://${mcid}/metadata.json`

        console.log(metaURI)

        setProgressMsg('Minting your BlockNFT')
        const contract = await getContract('BUIBlockNFT', signer)
        const cost = await contract.publishPrice()
        const [terr, tx] = await resolver(
          contract.publish(cidHash, metaURI, { value: cost })
        )
        if (terr !== undefined || tx === undefined) {
          setError(new Error(terr ? terr.message : 'Transaction was empty'))
          setStep(step)
          setIsMinting(false)
          return
        }

        setProgressMsg('Confirming the transaction')
        const { transactionHash, gasUsed } = await tx.wait()
        setProgressMsg(`Transaction Confirmed: ${transactionHash as string}`)
        console.log(transactionHash, gasUsed)
        setIsMinting(false)
      }
    },
    [
      addIPFS,
      addWeb3Storage,
      encryptFile,
      getContract,
      router,
      connect,
      signer,
      step,
      steps,
      formRef.current,
      saveEncryption,
      createAuthCondition,
    ]
  )

  return (
    <>
      <Head>
        <title>Decentralized UI software as an NFT – Blocks UI Protocol</title>
        <meta
          name="description"
          content="Providing an open and decentralized framework for building user interface software that is simple enough for anyone to use."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div
        className="fixed top-0 left-0 hidden h-full w-1/2 bg-white lg:block"
        aria-hidden="true"
      />
      <div
        className="fixed top-0 right-0 hidden h-full w-1/2 bg-neutral-50 lg:block"
        aria-hidden="true"
      />
      <header className="relative border-b border-neutral-200 bg-white text-sm font-medium text-neutral-700">
        <div className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
          <div className="relative flex justify-end sm:justify-center">
            <a href="/" className="absolute left-0 top-1/2 -mt-4">
              <span className="sr-only">Blocks UI Protocol</span>
              <Logo className="h-8 w-auto" />
            </a>
            <nav aria-label="Progress" className="hidden sm:block">
              <ol role="list" className="flex space-x-4">
                {steps.map((step: any, stepIdx: any) => (
                  <li key={step.name} className="flex items-center">
                    <StepNav step={step} />
                    {stepIdx !== steps.length - 1 ? (
                      <ChevronRightIcon
                        className="ml-4 h-5 w-5 text-neutral-300"
                        aria-hidden="true"
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            </nav>
            <p className="sm:hidden">Step 2 of 4</p>
          </div>
        </div>
      </header>
      <main className="relative mx-auto grid max-w-7xl grid-cols-1 gap-x-16 lg:grid-cols-2 lg:px-8 xl:gap-x-48">
        <h1 className="sr-only">Order information</h1>
        <section
          aria-labelledby="summary-heading"
          className="bg-neutral-50 px-4 pt-16 pb-10 sm:px-6 lg:col-start-2 lg:row-start-1 lg:bg-transparent lg:px-0 lg:pb-16"
        >
          <div className="mx-auto max-w-lg lg:max-w-none">
            <h2
              id="summary-heading"
              className="text-lg font-medium text-neutral-900"
            >
              MoonMail Contact Form
            </h2>
            <button
              type="button"
              className="relative my-6 block w-full rounded-lg border-2 border-dashed border-neutral-300 p-12 text-center hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
            >
              <span className="mt-2 block text-sm font-medium text-neutral-900">
                Block Preview
              </span>
            </button>
            <dl className="hidden space-y-6 border-t border-neutral-200 pt-6 text-sm font-medium text-neutral-900 lg:block">
              <div className="flex items-center justify-between">
                <dt className="text-base">Price</dt>
                <dd className="text-base">0.33 ETH</dd>
              </div>
            </dl>
            <Popover className="fixed inset-x-0 bottom-0 flex flex-col-reverse text-sm font-medium text-neutral-900 lg:hidden">
              <div className="relative z-10 border-t border-neutral-200 bg-white px-4 sm:px-6">
                <div className="mx-auto max-w-lg">
                  <Popover.Button className="flex w-full items-center py-6 font-medium">
                    <span className="mr-auto text-base">Total</span>
                    <span className="mr-2 text-base">$361.80</span>
                    <ChevronUpIcon
                      className="h-5 w-5 text-neutral-500"
                      aria-hidden="true"
                    />
                  </Popover.Button>
                </div>
              </div>
              <Transition.Root as={Fragment}>
                <div>
                  <Transition.Child
                    as={Fragment}
                    enter="transition-opacity ease-linear duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="transition-opacity ease-linear duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Popover.Overlay className="fixed inset-0 bg-black bg-opacity-25" />
                  </Transition.Child>
                  <Transition.Child
                    as={Fragment}
                    enter="transition ease-in-out duration-300 transform"
                    enterFrom="translate-y-full"
                    enterTo="translate-y-0"
                    leave="transition ease-in-out duration-300 transform"
                    leaveFrom="translate-y-0"
                    leaveTo="translate-y-full"
                  >
                    <Popover.Panel className="relative bg-white px-4 py-6 sm:px-6">
                      <dl className="mx-auto max-w-lg space-y-6">
                        <div className="flex items-center justify-between">
                          <dt className="text-neutral-600">Subtotal</dt>
                          <dd>$320.00</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-neutral-600">Shipping</dt>
                          <dd>$15.00</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-neutral-600">Taxes</dt>
                          <dd>$26.80</dd>
                        </div>
                      </dl>
                    </Popover.Panel>
                  </Transition.Child>
                </div>
              </Transition.Root>
            </Popover>
          </div>
        </section>
        <form
          className="px-4 pt-16 pb-36 sm:px-6 lg:col-start-1 lg:row-start-1 lg:px-0 lg:pb-16"
          onSubmit={handleContinue}
          ref={formRef}
        >
          <div className="mx-auto max-w-lg lg:max-w-none">
            {step === 1 && (
              <>
                <section aria-labelledby="metadata-heading">
                  <h2
                    id="metadata-heading"
                    className="text-lg font-medium text-neutral-900"
                  >
                    Metadata
                  </h2>
                  <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-3">
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Name
                      </label>
                      <div className="mt-1">
                        <input
                          type="text"
                          id="name"
                          name="blockName"
                          className="block w-full rounded-md border-neutral-300 shadow-sm focus:border-neutral-500 focus:ring-neutral-500 sm:text-sm"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="description"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Description
                      </label>
                      <div className="mt-1">
                        <input
                          type="text"
                          id="description"
                          name="description"
                          className="block w-full rounded-md border-neutral-300 shadow-sm focus:border-neutral-500 focus:ring-neutral-500 sm:text-sm"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="cover-image"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Cover image
                      </label>
                      <div className="mt-1">
                        <div className="flex max-w-lg justify-center rounded-md border-2 border-dashed border-neutral-300 px-6 pt-5 pb-6">
                          <div className="space-y-1 text-center">
                            <svg
                              className="mx-auto h-12 w-12 text-neutral-400"
                              stroke="currentColor"
                              fill="none"
                              viewBox="0 0 48 48"
                              aria-hidden="true"
                            >
                              <path
                                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <div className="flex text-sm text-neutral-600">
                              <label
                                htmlFor="file-upload"
                                className="relative cursor-pointer rounded-md bg-white font-medium text-green-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-500 focus-within:ring-offset-2 hover:text-green-500"
                              >
                                <span>Upload a file</span>
                                <input
                                  id="file-upload"
                                  name="image-upload"
                                  type="file"
                                  className="sr-only"
                                />
                              </label>
                              <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-neutral-500">
                              PNG, JPG, GIF up to 10MB
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="tags"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Tags
                      </label>
                      <div className="mt-1">
                        <input
                          type="text"
                          id="tags"
                          name="tags"
                          className="block w-full rounded-md border-neutral-300 shadow-sm focus:border-neutral-500 focus:ring-neutral-500 sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
            {step === 2 && (
              <section aria-labelledby="mint-heading">
                <h2
                  id="mint-heading"
                  className="text-lg font-medium text-neutral-900"
                >
                  Mint Block NFT
                </h2>
                <p className="mt-6 text-sm font-medium text-neutral-700">
                  {error === undefined ? '' : error.message}
                  {!error && progressMsg}
                </p>
              </section>
            )}
            <div className="mt-10 border-t border-neutral-200 pt-6 sm:flex sm:items-center sm:justify-between">
              {!isMinting && (
                <button
                  type="submit"
                  className="w-full rounded-md border border-transparent bg-green-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-green-50 sm:order-last sm:ml-6 sm:w-auto"
                >
                  {buttonLabel}
                </button>
              )}
              <p className="mt-4 text-center text-sm text-neutral-500 sm:mt-0 sm:text-left">
                Lorem ipsum.
              </p>
            </div>
          </div>
        </form>
      </main>
    </>
  )
}

export default Publish
