import { Dialog, Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import Button from '@/components/Button'

import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useEnsAvatar,
  useEnsName,
} from 'wagmi'

const LoggedInButtonPopUp = () => {
  const account = useAccount()
  const { data: ensAvatar } = useEnsAvatar({ addressOrName: account?.address })
  return (
    <div className="flex items-center space-x-8">
      <Menu as="div" className="relative inline-block text-left">
        <Menu.Button className="flex rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2">
          <span className="sr-only">Open user menu</span>
          <img className="h-8 w-8 rounded-full" src={ensAvatar} alt="" />
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            <div className="py-1">
              <Menu.Item>
                {({ active }) => (
                  <button
                    className={clsx(
                      active ? 'bg-neutral-100' : '',
                      'block px-4 py-2 text-sm text-neutral-700'
                    )}
                  >
                    Profile
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    className={clsx(
                      active ? 'bg-neutral-100' : '',
                      'block px-4 py-2 text-sm text-neutral-700'
                    )}
                  >
                    My Blocks
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    className={clsx(
                      active ? 'bg-neutral-100' : '',
                      'block px-4 py-2 text-sm text-neutral-700'
                    )}
                  >
                    Disconnect
                  </button>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
      <Button>New Block</Button>
    </div>
  )
}

export default LoggedInButtonPopUp
