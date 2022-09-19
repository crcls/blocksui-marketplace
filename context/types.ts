export type ConnectWalletAction = {
  payload: boolean
  type: 'CONNECT_WALLET'
}

export type DropItemAction = {
  payload: any
  type: 'DROP_ITEM'
}

export type DropItemInItemAction = {
  payload: any
  type: 'DROP_ITEM_IN_ITEM'
}

export type State = {
  connectWallet: {
    open: boolean
  }
  droppedItems: object[]
}
