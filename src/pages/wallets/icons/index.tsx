import { ExternalSvg } from 'src/components/ExternalSvg'
import wallet from './wallet.svg?url'
import neuronWallet from './neuronWallet.svg?url'
import joyId from './joyIdIcon.svg?url'
import safePal from './safePal.svg?url'
import ledger from './ledger.svg?url'
import operaWallet from './operaWallet.svg?url'
import imToken from './imToken.svg?url'
import gateWeb3Wallet from './GateWeb3Wallet.svg?url'
import oneKey from './onekey.svg?url'
import reiWallet from './reiwallet.svg?url'
import utxoGlobalWallet from './utxoGlobal.svg?url'
import imKey from './imKey.svg?url'
import coinEx from './coinex.svg?url'

const WalletIcon = () => <ExternalSvg src={wallet} />
const NeuronWalletIcon = () => <ExternalSvg src={neuronWallet} />
const JoyIdIcon = () => <ExternalSvg src={joyId} />
const SafePalIcon = () => <ExternalSvg src={safePal} />
const LedgerIcon = () => <ExternalSvg src={ledger} />
const OperaWalletIcon = () => <ExternalSvg src={operaWallet} />
const ImTokenIcon = () => <ExternalSvg src={imToken} />
const GateWeb3Wallet = () => <ExternalSvg src={gateWeb3Wallet} width={282} height={47} alt="Gate Web3 Wallet" />
const OneKey = () => <ExternalSvg src={oneKey} />
const ReiWallet = () => <ExternalSvg src={reiWallet} />
const UTXOGlobalWallet = () => <ExternalSvg src={utxoGlobalWallet} />
const ImKey = () => <ExternalSvg src={imKey} />
const CoinEx = () => <ExternalSvg src={coinEx} alt="CoinEx Wallet" />

const CkbBullIcon = () => (
  <img src="/images/ckbull_logo.jpg" alt="ckbull" width="45" height="45" style={{ borderRadius: '50%' }} />
)

export {
  WalletIcon,
  NeuronWalletIcon,
  CkbBullIcon,
  JoyIdIcon,
  SafePalIcon,
  LedgerIcon,
  OperaWalletIcon,
  ImTokenIcon,
  OneKey,
  ReiWallet,
  GateWeb3Wallet,
  UTXOGlobalWallet,
  ImKey,
  CoinEx,
}
