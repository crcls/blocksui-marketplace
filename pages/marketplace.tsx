import { FC, Fragment, useCallback, useState, useEffect } from 'react'
import { Dialog, Disclosure, Menu, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import {
  ChevronDownIcon,
  FunnelIcon,
  MinusIcon,
  PlusIcon,
  Squares2X2Icon,
} from '@heroicons/react/20/solid'
import type { NextPage } from 'next'
import Head from 'next/head'
import clsx from 'clsx'
import { useMoralis, useChain, useWeb3Contract } from 'react-moralis'
import { BigNumber } from 'ethers'

import Header from '@/components/Header'
import Footer from '@/components/Footer'

import useContracts from '../hooks/use-contracts'
import useIPFS from '../hooks/use-ipfs'
import { resolver } from '../utils/async'
import { uint8ToStr, readFile } from '../utils/bytes'

const sortOptions = [
  { name: 'Most Popular', href: '#', current: true },
  { name: 'Best Rating', href: '#', current: false },
  { name: 'Newest', href: '#', current: false },
  { name: 'Price: Low to High', href: '#', current: false },
  { name: 'Price: High to Low', href: '#', current: false },
]
const subCategories = [
  { name: 'Design', href: '#' },
  { name: 'Management', href: '#' },
  { name: 'Marketing', href: '#' },
  { name: 'Made by CRCLS', href: '#' },
]
const filters = [
  {
    id: 'pricing',
    name: 'Pricing',
    options: [
      { value: '0', label: '0 ETH - 0.25 ETH', checked: false },
      { value: '0.25', label: '0.25 ETH - 0.5 ETH', checked: false },
      { value: '0.50', label: '0.5 ETH - 0.75 ETH', checked: false },
      { value: '0.75', label: '0.75+ ETH', checked: false },
    ],
  },
]

function ipfsToHttp(ipfs?: string): string {
  if (!ipfs) return ''
  return `https://ipfs.io/ipfs/${ipfs.split('//')[1]}`
}

interface ListingBase {
  licensable: boolean
  metaDataURI: string
  owner: string
  pricePerDay: BigNumber
  price?: BigNumber
}

interface Listing extends ListingBase {
  description?: string
  href?: string
  image?: string
  name?: string
}

const ListingItems: FC<{ address: string; abi: any }> = ({ address, abi }) => {
  const [listings, setListings] = useState<Listing[]>([])
  const [error, setError] = useState<Error | null>(null)
  const { getWeb3Storage } = useIPFS()
  const { data, runContractFunction, isLoading } = useWeb3Contract({
    abi,
    contractAddress: address,
    functionName: 'getListings',
    params: {
      amount: 25,
      page: 0, // TODO: add pagination
    },
  })

  const resolveMetadata = useCallback(
    async (items: ListingBase[]): Promise<Listing[]> => {
      const result = items.reduce<Promise<any[]>>(async (memo, listing) => {
        if (listing.owner === '0x0000000000000000000000000000000000000000')
          return await Promise.resolve(memo)

        const cid = listing.metaDataURI.split('//')[1].split('/')[0]
        const [err, files] = await resolver(getWeb3Storage(cid))

        if (err !== undefined || files === undefined) {
          throw new Error('Failed to fetch metadata')
        }

        const data = new Uint8Array(await readFile(files[0]))
        const json = uint8ToStr(data, 'utf8')
        const metadata = JSON.parse(json)

        return await Promise.resolve([
          ...(await memo),
          {
            ...listing,
            ...metadata,
          },
        ])
      }, Promise.resolve([]))

      return await result
    },
    [getWeb3Storage]
  )

  useEffect(() => {
    if (data === null && !isLoading) {
      runContractFunction()
        .then(async (data) => {
          if (data) {
            resolveMetadata(data as ListingBase[])
              .then(setListings)
              .catch(setError)
          }
        })
        .catch(setError)
    }
  }, [resolveMetadata, data, runContractFunction, isLoading])

  if (error) {
    return <p>{error.message}</p>
  }

  return (
    <>
      {listings.map((listing, i) => (
        <a
          key={`blockListing-${i}`}
          href={listing.href}
          className="group text-sm"
        >
          <div className="aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-lg bg-neutral-100 group-hover:opacity-75">
            <img
              src={ipfsToHttp(listing.image)}
              alt={listing.name}
              className="h-full w-full object-cover object-center"
            />
          </div>
          <h3 className="mt-4 font-medium text-black">{listing.name}</h3>
          <p className="italic text-neutral-500">{listing.description}</p>
          <p className="mt-2 font-medium text-black">
            {listing.licensable
              ? listing.pricePerDay.toString()
              : listing.price?.toString()}
          </p>
        </a>
      ))}
    </>
  )
}

const Marketplace: NextPage = () => {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const { switchNetwork, chain } = useChain()
  const [error, setError] = useState<Error | null>(null)
  const { enableWeb3, isWeb3Enabled } = useMoralis()
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<any | null>(null)
  const { getContractABI, contractsLoaded } = useContracts()
  const [config, setConfig] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    if (!loading) {
      if (!isWeb3Enabled) {
        setLoading(true)
        console.log('Enabling Web3')
        enableWeb3({
          chainId: 80001,
        })
          .then((resp) => {
            setProvider(resp)
            setLoading(false)
          })
          .catch((e) => {
            setError(e)
            setLoading(false)
          })
      } else if (chain?.networkId !== 80001) {
        setLoading(true)
        setError(new Error('Switching network to Polygon Mumbai'))
        switchNetwork('0x13801').catch(console.error)
        setLoading(false)
      }
    }
  }, [
    loading,
    setLoading,
    provider,
    switchNetwork,
    chain,
    enableWeb3,
    isWeb3Enabled,
  ])

  useEffect(() => {
    if (contractsLoaded && config === null) {
      try {
        setConfig(getContractABI('BUIMarketplace'))
      } catch (e) {
        console.error(e)
      }
    }
  }, [getContractABI, contractsLoaded, config])

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
      <Header />
      <Transition.Root show={mobileFiltersOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-40 lg:hidden"
          onClose={setMobileFiltersOpen}
        >
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>
          <div className="fixed inset-0 z-40 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="translate-x-full"
            >
              <Dialog.Panel className="relative ml-auto flex h-full w-full max-w-xs flex-col overflow-y-auto bg-white py-4 pb-12 shadow-xl">
                <div className="flex items-center justify-between px-4">
                  <h2 className="text-lg font-medium text-black">Filters</h2>
                  <button
                    type="button"
                    className="-mr-2 flex h-10 w-10 items-center justify-center rounded-md bg-white p-2 text-neutral-400"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    <span className="sr-only">Close menu</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <form className="mt-4 border-t border-neutral-200">
                  <h3 className="sr-only">Categories</h3>
                  <ul role="list" className="px-2 py-3 font-medium text-black">
                    {subCategories.map((category) => (
                      <li key={category.name}>
                        <a href={category.href} className="block px-2 py-3">
                          {category.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {filters.map((section) => (
                    <Disclosure
                      as="div"
                      key={section.id}
                      className="border-t border-neutral-200 px-4 py-6"
                    >
                      {({ open }) => (
                        <>
                          <h3 className="-mx-2 -my-3 flow-root">
                            <Disclosure.Button className="flex w-full items-center justify-between bg-white px-2 py-3 text-neutral-400 hover:text-neutral-500">
                              <span className="font-medium text-black">
                                {section.name}
                              </span>
                              <span className="ml-6 flex items-center">
                                {open ? (
                                  <MinusIcon
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <PlusIcon
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                            </Disclosure.Button>
                          </h3>
                          <Disclosure.Panel className="pt-6">
                            <div className="space-y-6">
                              {section.options.map((option, optionIdx) => (
                                <div
                                  key={option.value}
                                  className="flex items-center"
                                >
                                  <input
                                    id={`filter-mobile-${section.id}-${optionIdx}`}
                                    name={`${section.id}[]`}
                                    defaultValue={option.value}
                                    type="checkbox"
                                    defaultChecked={option.checked}
                                    className="h-4 w-4 rounded border-neutral-300 text-neutral-600 focus:ring-neutral-500"
                                  />
                                  <label
                                    htmlFor={`filter-mobile-${section.id}-${optionIdx}`}
                                    className="ml-3 min-w-0 flex-1 text-neutral-500"
                                  >
                                    {option.label}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </Disclosure.Panel>
                        </>
                      )}
                    </Disclosure>
                  ))}
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-baseline justify-between border-b border-neutral-200 pt-24 pb-6">
          <h1 className="text-4xl font-medium tracking-tight text-black">
            Marketplace
          </h1>
          <div className="flex items-center">
            <Menu as="div" className="relative inline-block text-left">
              <div>
                <Menu.Button className="group inline-flex justify-center text-sm font-medium text-neutral-700 hover:text-black">
                  Sort
                  <ChevronDownIcon
                    className="-mr-1 ml-1 h-5 w-5 flex-shrink-0 text-neutral-400 group-hover:text-neutral-500"
                    aria-hidden="true"
                  />
                </Menu.Button>
              </div>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 z-10 mt-2 w-40 origin-top-right rounded-md bg-white shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    {sortOptions.map((option) => (
                      <Menu.Item key={option.name}>
                        {({ active }) => (
                          <a
                            href={option.href}
                            className={clsx(
                              option.current
                                ? 'font-medium text-black'
                                : 'text-neutral-500',
                              active ? 'bg-neutral-100' : '',
                              'block px-4 py-2 text-sm'
                            )}
                          >
                            {option.name}
                          </a>
                        )}
                      </Menu.Item>
                    ))}
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
            <button
              type="button"
              className="-m-2 ml-5 p-2 text-neutral-400 hover:text-neutral-500 sm:ml-7"
            >
              <span className="sr-only">View grid</span>
              <Squares2X2Icon className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="-m-2 ml-4 p-2 text-neutral-400 hover:text-neutral-500 sm:ml-6 lg:hidden"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <span className="sr-only">Filters</span>
              <FunnelIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <section aria-labelledby="products-heading" className="pt-6 pb-24">
          <h2 id="products-heading" className="sr-only">
            Blocks
          </h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-4">
            <form className="hidden lg:block">
              <h3 className="sr-only">Categories</h3>
              <ul
                role="list"
                className="space-y-4 border-b border-neutral-200 pb-6 text-sm font-medium text-black"
              >
                {subCategories.map((category) => (
                  <li key={category.name}>
                    <a href={category.href}>{category.name}</a>
                  </li>
                ))}
              </ul>
              {filters.map((section) => (
                <Disclosure
                  as="div"
                  key={section.id}
                  className="border-b border-neutral-200 py-6"
                >
                  {({ open }) => (
                    <>
                      <h3 className="-my-3 flow-root">
                        <Disclosure.Button className="flex w-full items-center justify-between bg-white py-3 text-sm text-neutral-400 hover:text-neutral-500">
                          <span className="font-medium text-black">
                            {section.name}
                          </span>
                          <span className="ml-6 flex items-center">
                            {open ? (
                              <MinusIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                              />
                            ) : (
                              <PlusIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                        </Disclosure.Button>
                      </h3>
                      <Disclosure.Panel className="pt-6">
                        <div className="space-y-4">
                          {section.options.map((option, optionIdx) => (
                            <div
                              key={option.value}
                              className="flex items-center"
                            >
                              <input
                                id={`filter-${section.id}-${optionIdx}`}
                                name={`${section.id}[]`}
                                defaultValue={option.value}
                                type="checkbox"
                                defaultChecked={option.checked}
                                className="h-4 w-4 rounded border-neutral-300 text-neutral-600 focus:ring-neutral-500"
                              />
                              <label
                                htmlFor={`filter-${section.id}-${optionIdx}`}
                                className="ml-3 text-sm text-neutral-600"
                              >
                                {option.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </Disclosure.Panel>
                    </>
                  )}
                </Disclosure>
              ))}
            </form>
            <div className="grid grid-cols-1 gap-y-10 gap-x-6 sm:grid-cols-2 lg:col-span-3 lg:gap-x-8">
              {error && <p>error.message</p>}
              {config !== null && (
                <ListingItems address={config.address} abi={config.abi} />
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

export default Marketplace
