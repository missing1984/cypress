/* eslint-disable no-console */
import Debug from 'debug'
import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'
import formatWebpackMessages from 'react-dev-utils/formatWebpackMessages'
import { StartDevServer } from '.'
import { makeWebpackConfig } from './makeWebpackConfig'
import ora from 'ora'

const debug = Debug('cypress:webpack-dev-server:start')

let spinner

export async function start ({ webpackConfig: userWebpackConfig, options, ...userOptions }: StartDevServer): Promise<WebpackDevServer> {
  if (!userWebpackConfig) {
    debug('User did not pass in any webpack configuration')
  }

  // @ts-expect-error ?? webpackDevServerPublicPathRoute is not a valid option of Cypress.Config
  const { projectRoot, webpackDevServerPublicPathRoute, isTextTerminal } = options.config

  const webpackConfig = await makeWebpackConfig(userWebpackConfig || {}, {
    files: options.specs,
    projectRoot,
    webpackDevServerPublicPathRoute,
    devServerEvents: options.devServerEvents,
    supportFile: options.config.supportFile as string,
    isOpenMode: !isTextTerminal,
    ...userOptions,
  })

  debug('compiling webpack')

  const compiler = webpack(webpackConfig)

  debug('starting webpack dev server')

  // TODO: write a test for how we are NOT modifying publicPath
  // here, and instead stripping it out of the cypress proxy layer
  //
  // ...this prevents a problem if users have a 'before' or 'after'
  // function defined in their webpack config, it does NOT
  // interfere with their routes... otherwise the public
  // path we are prefixing like /__cypress/src/ would be
  // prepended to req.url and cause their routing handlers to fail
  //
  // NOTE: we are merging in webpackConfig.devServer here so
  // that user values for the devServer get passed on correctly
  // since we are passing in the compiler directly, and these
  // devServer options would otherwise get ignored
  const webpackDevServerConfig = {
    port: 8080,
    host: 'localhost',
    ...userWebpackConfig.devServer,
    hot: false,
    inline: false,
  }

  const server = new WebpackDevServer(compiler, webpackDevServerConfig)

  server.listen(webpackDevServerConfig.port, webpackDevServerConfig.host, (err) => {
    if (err) {
      console.error(err)
    }
  })

  compiler.hooks.invalid.tap('cyInvalidServer', function () {
    console.log()
    spinner = ora('Compiling Tests...').start()
  })

  // Custom error reporting
  compiler.hooks.done.tap('cyCustomErrorServer', function (stats) {
    if (spinner) {
      spinner.stop()
    }

    const messages = formatWebpackMessages(stats.toJson({}, true))

    if (!messages.errors.length && !messages.warnings.length) {
      console.log('Compiled successfully!')
    }

    //printAllErrorsAndWarnings(messages, stats.compilation)
  })

  return server
}
