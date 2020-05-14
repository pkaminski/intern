import * as nodeUtil from 'util';
import * as util from './util';
import Test from 'src/core/lib/Test';
import { Tests } from 'src/core/lib/interfaces/object';

import Tunnel, { IOEvent } from 'src/tunnels/Tunnel';
import { NormalizedEnvironment } from 'src/tunnels/types';
import { createCompositeHandle, Handle } from 'src/common';

function writeIOEvent(event: IOEvent) {
  process.stdout.write(event.data);
}

function addVerboseListeners(tunnel: Tunnel) {
  return createCompositeHandle(
    tunnel.on('stdout', writeIOEvent),
    tunnel.on(
      'stderr',
      writeIOEvent
    ) /*,
		TODO: enable when we figure out progress events
		tunnel.on('downloadprogress', function (info) {
			process.stdout.write('.');
			if (info.loaded >= info.total) {
				process.stdout.write('\n');
			}
		})*/
  );
}

function assertNormalizedProperties(environment: NormalizedEnvironment) {
  const message = ' undefined for ' + nodeUtil.inspect(environment.descriptor);
  assert.isDefined(environment.browserName, 'browserName' + message);
  assert.isDefined(environment.version, 'version' + message);
  assert.isDefined(environment.platform, 'platform' + message);
}

function checkCredentials(tunnel: Tunnel, options: any) {
  if (options.checkCredentials) {
    return options.checkCredentials(tunnel);
  }
  return /\S+:\S+/.test(tunnel.auth!);
}

function getCleanup(tunnel: Tunnel, handle?: Handle) {
  return () => {
    if (handle) {
      handle.destroy();
    }
    return util.cleanup(tunnel);
  };
}

export function addEnvironmentTest(
  suite: Tests,
  TunnelClass: typeof Tunnel,
  checkEnvironment: Function,
  options?: any
): Tests {
  options = options || {};

  return {
    ...suite,
    getEnvironments() {
      const tunnel = new TunnelClass();

      if (options.needsAuthData && !checkCredentials(tunnel, options)) {
        this.skip('missing auth data');
      }

      let handle: Handle | undefined;
      if (intern.config.debug) {
        handle = addVerboseListeners(tunnel);
      }

      const cleanup = getCleanup(tunnel, handle);
      return tunnel
        .getEnvironments()
        .then(function(environments) {
          assert.isArray(environments);
          assert.isAbove(
            environments.length,
            0,
            'Expected at least 1 environment'
          );
          environments.forEach(function(environment) {
            assertNormalizedProperties(environment);
            assert.property(environment, 'descriptor');
            checkEnvironment(environment.descriptor);
          });
        })
        .then(cleanup)
        .catch(reason => {
          return cleanup().then(() => {
            // ECONREFUSED generally means TestingBot is down, which is outside
            // of our control.
            if (reason.code === 'ECONNREFUSED') {
              this.skip('Service is unreachable');
            } else {
              throw reason;
            }
          });
        })
        .finally(cleanup);
    }
  };
}

export function addStartStopTest(
  suite: Tests,
  TunnelClass: typeof Tunnel,
  options?: any
): Tests {
  options = options || {};

  return {
    ...suite,

    'start and stop'() {
      const tunnel = new TunnelClass();

      if (
        options.needsAuthData !== false &&
        !checkCredentials(tunnel, options)
      ) {
        this.skip('missing auth data');
      }

      let handle: Handle | undefined;
      if (intern.config.debug) {
        handle = addVerboseListeners(tunnel);
      }

      const timeout = options.timeout || 30000;
      this.async(timeout);

      const cleanup = getCleanup(tunnel, handle);
      const cleanupTimer = setTimeout(() => {
        cleanup();
      }, timeout - 5000);

      if (typeof options.port !== 'undefined') {
        tunnel.port = options.port;
      }

      return tunnel
        .start()
        .then(function() {
          clearTimeout(cleanupTimer);
          return tunnel.stop();
        })
        .catch(reason => {
          clearTimeout(cleanupTimer);
          if (reason.code === 'ECONNREFUSED') {
            this.skip('Service is unreachable');
          } else {
            throw reason;
          }
        })
        .finally(cleanup);
    }
  };
}

export async function startStopTest(
  test: Test,
  TunnelClass: typeof Tunnel,
  options?: any
) {
  const tunnel = new TunnelClass();

  if (options.needsAuthData !== false && !checkCredentials(tunnel, options)) {
    test.skip('missing auth data');
  }

  let handle: Handle | undefined;
  if (intern.config.debug) {
    handle = addVerboseListeners(tunnel);
  }

  const timeout = options.timeout || 30000;
  test.async(timeout);

  const cleanup = getCleanup(tunnel, handle);
  const cleanupTimer = setTimeout(() => {
    cleanup();
  }, timeout - 5000);

  if (typeof options.port !== 'undefined') {
    tunnel.port = options.port;
  }

  try {
    await tunnel.start();
    clearTimeout(cleanupTimer);
    await tunnel.stop();
  } catch (reason) {
    clearTimeout(cleanupTimer);
    if (reason.code === 'ECONNREFUSED') {
      test.skip('Service is unreachable');
    } else {
      throw reason;
    }
  } finally {
    cleanup();
  }
}