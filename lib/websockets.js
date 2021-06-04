const WebSocket = require('ws')
const axios = require('axios')

const uuid22 = a => a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + 1e3 + 4e3 + 8e5).replace(/[018]/g, uuid22)
const Sockets = {}
Sockets.ws = {}
Sockets.heartbeat = {}

getPublicWsToken = async function (baseURL) {
    let endpoint = '/api/v1/bullet-public'
    let url = baseURL + endpoint
    let result = await axios.post(url, {})
    return result.data
}

getPrivateWsToken = async function (baseURL, sign) {
    let endpoint = '/api/v1/bullet-private'
    let url = baseURL + endpoint
    let result = await axios.post(url, {}, sign)
    return result.data
}

getSocketEndpoint = async function (type, baseURL, environment, sign) {
    let r
    if (type == 'private') {
        r = await getPrivateWsToken(baseURL, sign)
    } else {
        r = await getPublicWsToken(baseURL)
    }
    let token = r.data.token
    let instanceServer = r.data.instanceServers[0]

    if (instanceServer) {
        if (environment === 'sandbox') {
            return `${instanceServer.endpoint}?token=${token}&[connectId=${Date.now()}]`
        } else if (environment === 'live') {
            return `${instanceServer.endpoint}?token=${token}&[connectId=${Date.now()}]`
        }
    } else {
        throw Error("No Kucoin WS servers running")
    }
}

/*  
  Initiate a websocket
  params = {
    topic: enum 
    symbols: array [optional depending on topic]
  }
  eventHanlder = function
*/
Sockets.initSocket = async function (params, eventHandler) {
    try {
        if (!params.sign) params.sign = false;
        if (!params.endpoint) params.endpoint = false;
        let [topic, endpoint, type] = Sockets.topics(params.topic, params.symbols, params.endpoint, params.sign)
        let sign = this.sign('/api/v1/bullet-private', {}, 'POST')
        let websocket = await getSocketEndpoint(type, this.baseURL, this.environment, sign)
        let ws = new WebSocket(websocket)
        const id = params.id || uuid22();
        Sockets.ws[id] = ws
        ws.on('open', () => {
            console.log(`${topic} - ${id} -  opening websocket connection... `)
            Sockets.subscribe(id, endpoint, type, eventHandler)
            Sockets.ws[id].heartbeat = setInterval(Sockets.socketHeartBeat, 20000, id)
        })
        ws.on('error', (error) => {
            Sockets.handleSocketError(error)
            console.log(error)
        })
        ws.on('ping', () => {
            return
        })
        ws.on('close', () => {
            if (!Sockets.ws[id])
                return;

            clearInterval(Sockets.ws[id].heartbeat)
            delete Sockets.ws[id];
            console.log(`${topic} - ${id} -  websocket closed... `)
        })
        return id;
    } catch (err) {
        console.log(err)
    }
}

Sockets.handleSocketError = function (error) {
    console.log('WebSocket error: ' + (error.code ? ' (' + error.code + ')' : '') +
        (error.message ? ' ' + error.message : ''))
}

Sockets.socketHeartBeat = function (id) {
    try{
        let ws = Sockets.ws[id]
        if (!ws)
            return;
        ws.ping()
    } catch (e) {

    }
}

Sockets.subscribe = async function (id, endpoint, type, eventHandler) {
    let ws = Sockets.ws[id]
    if (!ws)
        return;
    if (type === 'private') {
        ws.send(JSON.stringify({
            id: Date.now(),
            type: 'subscribe',
            topic: endpoint,
            privateChannel: true,
            response: true
        }))
    } else {
        ws.send(JSON.stringify({
            id: Date.now(),
            type: 'subscribe',
            topic: endpoint,
            response: true
        }))
    }
    ws.on('message', eventHandler)
}

Sockets.unsubscribe = async function (id, endpoint, type, eventHandler) {
    let ws = Sockets.ws[id]
    if (!ws)
        return;
    ws.send(JSON.stringify({
        id: Date.now(),
        type: 'unsubscribe',
        topic: endpoint,
        response: true
    }))
    ws.on('message', eventHandler)
}

Sockets.topics = function (topic, symbols = [], endpoint = false, sign = false) {
    if (endpoint) return [topic, endpoint + (symbols.length > 0 ? ':' : '') + symbols.join(','), sign ? 'private' : 'public']
    if (topic === 'ticker') {
        return [topic, "/market/ticker:" + symbols.join(','), 'public']
    } else if (topic === 'allTicker') {
        return [topic, "/market/ticker:all", 'public']
    } else if (topic === 'symbolSnapshot') {
        return [topic, "/market/snapshot:" + symbols[0], 'public']
    } else if (topic === 'marketSnapshot') {
        return [topic, "/market/snapshot:" + symbols[0], 'public']
    } else if (topic === 'orderbook') {
        return [topic, "/market/level2:" + symbols.join(','), 'public']
    } else if (topic === 'match') {
        return [topic, "/market/match:" + symbols.join(','), 'public']
    } else if (topic === 'fullMatch') {
        return [topic, "/spotMarket/level3:" + symbols.join(','), 'public']
    } else if (topic === 'orders') {
        return [topic, "/spotMarket/tradeOrders", 'private']
    } else if (topic === 'balances') {
        return [topic, "/account/balance", 'private']
    } else if (topic === 'depth50') {
        return [topic, "/spotMarket/level2Depth50:" + symbols.join(','), 'public']
    } else if (topic === 'depth5') {
        return [topic, "/spotMarket/level2Depth5:" + symbols.join(','), 'public']
    }
}

module.exports = Sockets
