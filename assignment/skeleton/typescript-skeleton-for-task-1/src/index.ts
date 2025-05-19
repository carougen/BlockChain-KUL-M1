import { network } from './network'

const BIND_PORT = 18018
const BIND_IP = '0.0.0.0'

async function main() {
  network.init(BIND_PORT, BIND_IP)
}

main()
