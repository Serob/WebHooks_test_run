# WebHooks service test run

This project shows the [WebHooks service](https://github.com/Serob/WebHooks) behaviour for 200 client request/s case on **one core** machine, when each request contains 4 URLs(2 - should succeed, 2 - should fail).
During the test run service used fakeRequest to make request to external URLs, and depending on it's returned result (fake response code) wrote data into MongoDB.

## Client request simulator
[Apache Jmeter 3.1](http://jmeter.apache.org/) - Load testing tool for services analysing and performance measuring.

### P.S.
*Simulator and the service were running on the same machine, which could cause performance reduction and affect service response time.*