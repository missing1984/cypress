/* eslint-disable no-console */
import Debug from 'debug'
import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'
import ora from 'ora'
import kleur from 'kleur'
import formatWebpackMessages from 'react-dev-utils/formatWebpackMessages'
import { StartDevServer } from '.'
import { makeWebpackConfig } from './makeWebpackConfig'

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
    noInfo: true,
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
      printStatus('Compiled successfully!', 'success')
    }

    printAllErrorsAndWarnings(messages, stats.compilation)
  })

  /**
   * @param {string} text
   * @param {'success'|'error'|'warning'} type
   */
  function printStatus (text, type) {
    if (type === 'success') {
      console.log(`${kleur.inverse().bold().green(' DONE ')} ${text}`)
    } else if (type === 'error') {
      console.error(`${kleur.inverse().bold().red(' FAIL ')} ${kleur.red(text)}`)
    } else {
      console.error(`${kleur.inverse().bold().yellow(' WARN ')} ${kleur.yellow(text)}`)
    }
  }

  /**
   * @param {object} messages
   * @param {object} compilation
   * @return {boolean}
   */
  function printAllErrorsAndWarnings (messages, compilation) {
    // If errors exist, only show errors
    if (messages.errors.length) {
      printAllErrors(messages.errors, compilation.errors)

      return true
    }

    // Show warnings if no errors were found
    if (messages.warnings.length) {
      printAllWarnings(messages.warnings, compilation.warnings)
    }

    return false
  }

  /**
   * @param {object} errors
   * @param {object} originalErrors
   */
  function printAllErrors (errors, originalErrors) {
    printErrors('Failed to compile', errors, originalErrors, 'error')
  }

  /**
   * @param {object} warnings
   * @param {object} originalWarnings
   */
  function printAllWarnings (warnings, originalWarnings) {
    printErrors('Compiled with warnings', warnings, originalWarnings, 'warning')
  }

  /**
   * @param {string} header
   * @param {object} errors
   * @param {object} originalErrors
   * @param {'success'|'error'|'warning'} type
   */
  function printErrors (header, errors, originalErrors, type) {
    printStatus(header, type)
    console.error()
    const messages = process.argv.indexOf('--verbose') ? originalErrors : errors

    messages.forEach((message) => {
      console.error(message.message || message)
    })
  }

  return server
}
